import { Context, Schema } from "effect";
import {
  HttpApiEndpoint,
  HttpApiError,
  HttpApiGroup,
  HttpApiMiddleware,
  HttpApiSecurity,
} from "effect/http-api";

/** A WorkOS user ID. It keys the user's Postgres row and selects their Durable Object. */
export const UserId = Schema.String.check(Schema.isPattern(/^[a-zA-Z0-9_-]{1,128}$/)).pipe(
  Schema.brand("UserId"),
);
export type UserId = typeof UserId.Type;

/** A row in the Postgres `users` table, recorded when the user first signs in to a stage. */
export const User = Schema.Struct({ id: UserId, name: Schema.String, email: Schema.String });
export type User = typeof User.Type;

/** A WorkOS session: one signed-in browser. */
export const Session = Schema.Struct({
  id: Schema.String,
  current: Schema.Boolean,
  userAgent: Schema.NullOr(Schema.String),
  ipAddress: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
  expiresAt: Schema.String,
});
export type Session = typeof Session.Type;

/** The signed-in user and their session, provided to every endpoint behind `Authentication`. */
export class CurrentUser extends Context.Service<
  CurrentUser,
  { readonly id: UserId; readonly sessionId: string }
>()("CurrentUser") {}

/**
 * Browsers present the sealed, HttpOnly `session` cookie that signing in sets. Machine clients
 * will get API keys of their own rather than sharing this cookie.
 */
export class Authentication extends HttpApiMiddleware.Service<
  Authentication,
  { provides: CurrentUser }
>()("Authentication", {
  error: HttpApiError.Unauthorized,
  security: { session: HttpApiSecurity.apiKey({ in: "cookie", key: "session" }) },
}) {}

/**
 * Sign in with Google through WorkOS. OAuth dictates these redirect routes; the callback ends by
 * creating an ordinary session, or by sending the browser back to `/sign-in` with an error.
 */
export class AuthGroup extends HttpApiGroup.make("auth")
  .add(
    HttpApiEndpoint.get("signIn", "/sign-in"),
    HttpApiEndpoint.get("callback", "/callback", {
      query: { code: Schema.optional(Schema.String), state: Schema.optional(Schema.String) },
    }),
  )
  .prefix("/auth") {}

export class UsersGroup extends HttpApiGroup.make("users")
  .add(HttpApiEndpoint.get("me", "/me", { success: User, error: HttpApiError.Unauthorized }))
  .middleware(Authentication)
  .prefix("/users") {}

/** Signing out is deleting a session: this browser's, another device's, or every one. */
export class SessionsGroup extends HttpApiGroup.make("sessions")
  .add(
    HttpApiEndpoint.get("list", "/", { success: Schema.Array(Session) }),
    HttpApiEndpoint.get("current", "/current", { success: Session }),
    HttpApiEndpoint.delete("deleteCurrent", "/current"),
    HttpApiEndpoint.delete("delete", "/:id", {
      params: { id: Schema.String },
      error: HttpApiError.NotFound,
    }),
    HttpApiEndpoint.delete("deleteAll", "/"),
  )
  .middleware(Authentication)
  .prefix("/sessions") {}
