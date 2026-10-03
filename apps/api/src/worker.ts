import { Api } from "@starter/contract/api";
import { DocumentNotFound } from "@starter/contract/documents";
import { DeckNotFound } from "@starter/contract/slides";
import { CurrentUser, User, UserId } from "@starter/contract/user";
import { InvalidOperation } from "@starter/contract/versioning";
import * as Cloudflare from "alchemy/Cloudflare";
import * as SQL from "alchemy/SQL/Postgres";
import { Config, Effect, Layer, Option } from "effect";
import { HttpRouter, HttpServer, HttpServerRequest, HttpServerResponse } from "effect/http";
import { HttpApiBuilder, HttpApiError } from "effect/http-api";
import { SqlSchema } from "effect/sql";

import { AuthenticationLive, type Device, sessionCookieOptions, WorkOSAuth } from "./auth.ts";
import { region } from "./database.ts";
import DeckObject from "./deck-object.ts";
import DocumentObject from "./document-object.ts";
import { Postgres } from "./postgres.ts";
import UserStore from "./user-store.ts";

// A typed failure crosses an object stub as a plain tagged object, so each handler rebuilds
// the class before the API encodes it. Goes away with alchemy-run/alchemy#1513.

export default class ApiWorker extends Cloudflare.Worker<ApiWorker>()(
  "Api",
  {
    main: import.meta.url,
    // Cloudflare.Telemetry needs tracing.startActiveSpan, which this date enables.
    compatibility: { date: "2026-08-25" },
    placement: { region: region.workers },
    workersDev: false,
    dev: { port: Config.Number("API_PORT").pipe(Config.withDefault(1338)) },
  },
  Effect.gen(function* () {
    const postgres = yield* Cloudflare.Hyperdrive.Connect(Postgres);
    // Opens a pool on a request's first query and closes it when the request ends: Hyperdrive
    // already keeps the connections to the database warm.
    const sql = yield* SQL.Postgres({
      url: postgres.connectionString,
      // The first connection to a `PS_DEV` branch through `alchemy dev` can take longer than the
      // driver's 5-second default; Hyperdrive keeps deployed connections warm.
      connectTimeout: "15 seconds",
      // Named statements die with the request's connection, and Hyperdrive replays them onto
      // whichever pooled connection it assigns: ~40ms on each request's first query, measured.
      prepare: false,
    });
    const userStores = yield* UserStore;
    const documents = yield* DocumentObject;
    const decks = yield* DeckObject;

    const auth = yield* WorkOSAuth;

    // Storage failures are defects: the HTTP boundary logs them and answers 500.
    const saveUser = SqlSchema.findOne({
      Request: User,
      Result: User,
      execute: (user) => sql`INSERT INTO users ${sql.insert(user)}
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email
        RETURNING id, name, email`,
    });
    const findUser = SqlSchema.findOneOption({
      Request: UserId,
      Result: User,
      execute: (id) => sql`SELECT id, name, email FROM users WHERE id = ${id}`,
    });

    // The callback lives on whichever origin the request came through, so each stage's
    // website receives its own sign-ins.
    const callbackUrl = (request: HttpServerRequest.HttpServerRequest) =>
      Option.match(HttpServerRequest.toURL(request), {
        onNone: () => "/api/auth/github/callback",
        onSome: (url) => new URL("/api/auth/github/callback", url.origin).toString(),
      });
    const stateCookie = "auth_state";
    const stateCookieOptions = {
      ...sessionCookieOptions,
      path: "/api/auth",
      maxAge: "10 minutes",
    } as const;
    // Ending this browser's session also clears its cookie, so it stops presenting it.
    const signedOut = HttpServerResponse.empty({ status: 204 }).pipe(
      HttpServerResponse.setCookieUnsafe("session", "", { ...sessionCookieOptions, maxAge: 0 }),
    );

    const authGroup = HttpApiBuilder.group(Api, "auth", (handlers) =>
      handlers.handleAll({
        github: ({ request }) => {
          // The callback compares this with the state WorkOS returns, so another site cannot
          // complete a sign-in in this browser.
          const state = crypto.randomUUID();
          const location = auth.authorizeUrl({ redirectUri: callbackUrl(request), state });
          return Effect.succeed(
            HttpServerResponse.redirect(location, { status: 302 }).pipe(
              HttpServerResponse.setCookieUnsafe(stateCookie, state, stateCookieOptions),
            ),
          );
        },
        githubCallback: ({ query, request }) =>
          Effect.gen(function* () {
            if (request.cookies[stateCookie] !== query.state) {
              return yield* Effect.fail(new HttpApiError.Unauthorized());
            }
            // The browser's address and user agent label the session in its user's device list.
            const device: Device = {};
            const ipAddress = request.headers["cf-connecting-ip"];
            const userAgent = request.headers["user-agent"];
            if (ipAddress !== undefined) device.ip_address = ipAddress;
            if (userAgent !== undefined) device.user_agent = userAgent;
            const { user, sealed } = yield* auth.signIn({ code: query.code, device });
            // Each stage's database records a user the first time they sign in to it.
            yield* Effect.orDie(saveUser(user));
            return HttpServerResponse.redirect("/", { status: 302 }).pipe(
              HttpServerResponse.setCookieUnsafe("session", sealed, sessionCookieOptions),
              HttpServerResponse.setCookieUnsafe(stateCookie, "", {
                ...stateCookieOptions,
                maxAge: 0,
              }),
            );
          }),
      }),
    );

    const usersGroup = HttpApiBuilder.group(Api, "users", (handlers) =>
      handlers.handleAll({
        me: () =>
          Effect.gen(function* () {
            const { id } = yield* CurrentUser;
            const user = yield* Effect.orDie(findUser(id));
            if (Option.isNone(user)) return yield* Effect.fail(new HttpApiError.Unauthorized());
            return user.value;
          }),
      }),
    );

    // WorkOS failures here are defects: the session was just verified, so WorkOS is reachable.
    const mySessions = Effect.flatMap(CurrentUser, ({ id, sessionId }) =>
      Effect.orDie(auth.sessions({ userId: id, currentSessionId: sessionId })),
    );
    const sessionsGroup = HttpApiBuilder.group(Api, "sessions", (handlers) =>
      handlers.handleAll({
        list: () => mySessions,
        current: () =>
          Effect.flatMap(mySessions, (sessions) => {
            const current = sessions.find((session) => session.current);
            return current === undefined
              ? Effect.die("the verified session is not active")
              : Effect.succeed(current);
          }),
        deleteCurrent: () =>
          Effect.gen(function* () {
            const { sessionId } = yield* CurrentUser;
            yield* Effect.orDie(auth.revoke(sessionId));
            return signedOut;
          }),
        delete: ({ params }) =>
          Effect.gen(function* () {
            // Only the signed-in user's own sessions can be ended.
            const session = (yield* mySessions).find(({ id }) => id === params.id);
            if (session === undefined) return yield* Effect.fail(new HttpApiError.NotFound());
            yield* Effect.orDie(auth.revoke(session.id));
            return session.current ? signedOut : HttpServerResponse.empty({ status: 204 });
          }),
        deleteAll: () =>
          Effect.gen(function* () {
            const sessions = yield* mySessions;
            yield* Effect.forEach(sessions, ({ id }) => Effect.orDie(auth.revoke(id)), {
              concurrency: "unbounded",
            });
            return signedOut;
          }),
      }),
    );

    const files = HttpApiBuilder.group(Api, "files", (handlers) =>
      handlers.handleAll({
        list: () => Effect.flatMap(CurrentUser, ({ id }) => userStores.getByName(id).list()),
        createDocument: ({ payload }) =>
          Effect.flatMap(CurrentUser, ({ id }) => userStores.getByName(id).createDocument(payload)),
        createDeck: ({ payload }) =>
          Effect.flatMap(CurrentUser, ({ id }) => userStores.getByName(id).createDeck(payload)),
      }),
    );
    const documentsGroup = HttpApiBuilder.group(Api, "documents", (handlers) =>
      handlers.handleAll({
        get: ({ params }) =>
          documents
            .getByName(params.documentId)
            .get()
            .pipe(
              Effect.catchTag("DocumentNotFound", (error) =>
                Effect.fail(new DocumentNotFound({ id: error.id })),
              ),
            ),
        set: ({ params, payload }) => documents.getByName(params.documentId).set(payload),
        apply: ({ params, payload }) =>
          documents
            .getByName(params.documentId)
            .apply(payload)
            .pipe(
              Effect.catchTag("DocumentNotFound", (error) =>
                Effect.fail(new DocumentNotFound({ id: error.id })),
              ),
              Effect.catchTag("InvalidOperation", (error) =>
                Effect.fail(
                  new InvalidOperation({ operationId: error.operationId, message: error.message }),
                ),
              ),
            ),
      }),
    );
    const decksGroup = HttpApiBuilder.group(Api, "decks", (handlers) =>
      handlers.handleAll({
        get: ({ params }) =>
          decks
            .getByName(params.deckId)
            .get()
            .pipe(
              Effect.catchTag("DeckNotFound", (error) =>
                Effect.fail(new DeckNotFound({ id: error.id })),
              ),
            ),
        set: ({ params, payload }) => decks.getByName(params.deckId).set(payload),
        apply: ({ params, payload }) =>
          decks
            .getByName(params.deckId)
            .apply(payload)
            .pipe(
              Effect.catchTag("DeckNotFound", (error) =>
                Effect.fail(new DeckNotFound({ id: error.id })),
              ),
              Effect.catchTag("InvalidOperation", (error) =>
                Effect.fail(
                  new InvalidOperation({ operationId: error.operationId, message: error.message }),
                ),
              ),
            ),
      }),
    );
    return {
      fetch: HttpApiBuilder.layer(Api).pipe(
        Layer.provide([authGroup, usersGroup, sessionsGroup, files, documentsGroup, decksGroup]),
        Layer.provide(AuthenticationLive.pipe(Layer.provide(Layer.succeed(WorkOSAuth, auth)))),
        Layer.provide(HttpServer.layerServices),
        HttpRouter.toHttpEffect,
      ),
    };
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        Cloudflare.Hyperdrive.ConnectBinding,
        // Effect spans join Cloudflare's trace, which already follows the website Worker into
        // this one and on into each Durable Object call. Cloudflare samples and exports it.
        Cloudflare.Telemetry(),
        WorkOSAuth.layer,
      ),
    ),
  ),
) {}
