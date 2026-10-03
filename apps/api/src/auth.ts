import { Credentials, Services } from "@distilled.cloud/workos";
import { Authentication, CurrentUser, Session, UserId } from "@starter/contract/user";
import { Config, Context, Effect, Layer, Option, Redacted, Schema } from "effect";
import { FetchHttpClient } from "effect/http";
import { HttpApiBuilder, HttpApiError } from "effect/http-api";
import * as Iron from "iron-webcrypto";
import { createRemoteJWKSet, errors, jwtVerify } from "jose";

const sessionCookie = Authentication.security.session;

/** What the `session` cookie holds, sealed so the browser can neither read nor forge it. */
const Tokens = Schema.Struct({ accessToken: Schema.String, refreshToken: Schema.String });
type Tokens = typeof Tokens.Type;

// WorkOS's generated schemas mark every field optional; decode the ones sign-in relies on. The
// client hands tokens back already redacted.
const Authenticated = Schema.Struct({
  user: Schema.Struct({
    id: UserId,
    email: Schema.String,
    first_name: Schema.optional(Schema.NullOr(Schema.String)),
    last_name: Schema.optional(Schema.NullOr(Schema.String)),
  }),
  access_token: Schema.Redacted(Schema.String),
  refresh_token: Schema.Redacted(Schema.String),
});
const AccessClaims = Schema.Struct({ sub: UserId, sid: Schema.String });
const WorkOSSessions = Schema.Struct({
  data: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      status: Schema.String,
      user_agent: Schema.NullOr(Schema.String),
      ip_address: Schema.NullOr(Schema.String),
      created_at: Schema.String,
      expires_at: Schema.String,
    }),
  ),
});

const unauthorized = () => new HttpApiError.Unauthorized();

/** What WorkOS records about the browser a session belongs to. */
export interface Device {
  ip_address?: string;
  user_agent?: string;
}

/**
 * Sign-in through WorkOS AuthKit with Google, and the sessions that follow it. `WORKOS_API_URL`
 * points local runs and tests at the WorkOS emulator; deployed stages use the real API.
 */
export class WorkOSAuth extends Context.Service<WorkOSAuth>()("WorkOSAuth", {
  make: Effect.gen(function* () {
    // Read while the Worker is constructed, so Alchemy binds each value to the Worker.
    const apiUrl = yield* Config.String("WORKOS_API_URL").pipe(
      Config.withDefault("https://api.workos.com"),
    );
    const clientId = yield* Config.String("WORKOS_CLIENT_ID");
    const apiKey = yield* Config.Redacted("WORKOS_API_KEY");
    // At least 32 characters; the bootstrap generates it, so nobody has to choose or copy one.
    const secret = yield* Config.Redacted("WORKOS_COOKIE_PASSWORD");

    const workos = Layer.mergeAll(
      Layer.succeed(Credentials, Effect.succeed({ apiKey, apiBaseUrl: apiUrl })),
      FetchHttpClient.layer,
    );
    const keys = createRemoteJWKSet(new URL(`/sso/jwks/${clientId}`, apiUrl));
    const sealOptions = Iron.defaults;

    const authenticate = (
      body: Services.workos.UserlandSessionsControllerAuthenticate0Request["body"],
    ) =>
      Services.workos
        .UserlandSessionsControllerAuthenticate0({ body })
        .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Authenticated)), Effect.provide(workos));

    const seal = (session: Tokens) =>
      Effect.promise(() => Iron.seal(session, Redacted.value(secret), sealOptions));

    const unseal = (sealed: string) =>
      Effect.tryPromise(() => Iron.unseal(sealed, Redacted.value(secret), sealOptions)).pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(Tokens)),
        Effect.mapError(unauthorized),
      );

    // `Option.none` means the token was genuine but expired, so a refresh can recover the session.
    const verify = (accessToken: string) =>
      Effect.tryPromise({
        try: () => jwtVerify(accessToken, keys),
        catch: (error) => error,
      }).pipe(
        Effect.flatMap(({ payload }) => Schema.decodeUnknownEffect(AccessClaims)(payload)),
        Effect.map(({ sub, sid }) => Option.some({ id: sub, sessionId: sid })),
        Effect.catchIf(
          (error) => error instanceof errors.JWTExpired,
          () => Effect.succeed(Option.none()),
        ),
        Effect.mapError(unauthorized),
      );

    return {
      /**
       * Sends the browser to AuthKit's sign-in page, configured to offer only Google. The page stays
       * in the flow because AuthKit runs the steps around sign-in, such as verifying an email.
       */
      authorizeUrl: ({ redirectUri, state }: { redirectUri: string; state: string }) => {
        const url = new URL("/user_management/authorize", apiUrl);
        url.search = new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri,
          response_type: "code",
          provider: "authkit",
          state,
        }).toString();
        return url.toString();
      },

      /**
       * Exchanges the callback's code for the user and a sealed session. The browser's address and
       * user agent label the session in the user's list of signed-in devices.
       */
      signIn: Effect.fn("WorkOSAuth.signIn")(function* ({
        code,
        device,
      }: {
        code: string;
        device: Device;
      }) {
        const result = yield* authenticate({
          client_id: clientId,
          client_secret: apiKey,
          grant_type: "authorization_code",
          code,
          ...device,
        }).pipe(
          // The browser only sees Unauthorized; the reason belongs in the logs.
          Effect.tapCause((cause) => Effect.logWarning("WorkOS code exchange failed", cause)),
          Effect.mapError(unauthorized),
        );
        const { user } = result;
        const name = [user.first_name, user.last_name].filter(Boolean).join(" ");
        return {
          user: { id: user.id, email: user.email, name: name || user.email },
          sealed: yield* seal({
            accessToken: Redacted.value(result.access_token),
            refreshToken: Redacted.value(result.refresh_token),
          }),
        };
      }),

      /** The user behind a session cookie, refreshing an expired access token and resealing it. */
      fromSession: Effect.fn("WorkOSAuth.fromSession")(function* (sealed: Redacted.Redacted) {
        const session = yield* unseal(Redacted.value(sealed));
        const current = yield* verify(session.accessToken);
        if (Option.isSome(current)) return current.value;
        const refreshed = yield* authenticate({
          client_id: clientId,
          client_secret: apiKey,
          grant_type: "refresh_token",
          refresh_token: session.refreshToken,
        }).pipe(Effect.mapError(unauthorized));
        const resealed = yield* seal({
          accessToken: Redacted.value(refreshed.access_token),
          refreshToken: Redacted.value(refreshed.refresh_token),
        });
        yield* HttpApiBuilder.securitySetCookie(sessionCookie, resealed, sessionCookieOptions);
        const identity = yield* verify(Redacted.value(refreshed.access_token));
        if (Option.isNone(identity)) return yield* Effect.fail(unauthorized());
        return identity.value;
      }),

      /** The user's signed-in sessions, marking the one this request came from. */
      sessions: Effect.fn("WorkOSAuth.sessions")(function* ({
        userId,
        currentSessionId,
      }: {
        userId: UserId;
        currentSessionId: string;
      }) {
        // A user signed in on more than 100 browsers at once is not a case the template handles.
        const { data } = yield* Services.workos
          .ListUserlandUserSessionsController({ id: userId, limit: 100 })
          .pipe(Effect.flatMap(Schema.decodeUnknownEffect(WorkOSSessions)), Effect.provide(workos));
        return data
          .filter((session) => session.status === "active")
          .map(
            (session): Session => ({
              id: session.id,
              current: session.id === currentSessionId,
              userAgent: session.user_agent,
              ipAddress: session.ip_address,
              createdAt: session.created_at,
              expiresAt: session.expires_at,
            }),
          );
      }),

      /** Ends a WorkOS session, so its refresh token stops working. */
      revoke: (sessionId: string) =>
        Services.workos
          .RevokeUserlandSessionsControllerSession({ session_id: sessionId })
          .pipe(Effect.asVoid, Effect.provide(workos)),
    };
  }),
}) {
  static readonly layer = Layer.effect(this)(this.make);
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
  maxAge: "30 days",
} as const;

/** Resolves the signed-in user for every endpoint behind `Authentication`. */
export const AuthenticationLive = Layer.effect(Authentication)(
  Effect.gen(function* () {
    const auth = yield* WorkOSAuth;
    return Authentication.of({
      session: (effect, { credential }) =>
        Effect.provideServiceEffect(effect, CurrentUser, auth.fromSession(credential)),
    });
  }),
);
