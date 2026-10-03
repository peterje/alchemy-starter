import { createFileRoute, Link } from "@tanstack/react-router";
import { Schema } from "effect";

import { buttonVariants } from "@/components/ui/button";

/** The callback sends a sign-in that did not finish back here with `error=failed`. */
const SignInSearch = Schema.Struct({ error: Schema.optional(Schema.Literal("failed")) });

export const Route = createFileRoute("/sign-in")({
  validateSearch: Schema.toStandardSchemaV1(SignInSearch),
  component: SignIn,
});

/**
 * The app's own sign-in page, so it looks the same in local runs and deployed stages. Continuing
 * goes straight to Google (the WorkOS emulator locally), not through AuthKit's hosted page.
 */
function SignIn() {
  const { error } = Route.useSearch();
  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/40 px-6">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8 shadow-xs">
        <Link to="/" className="text-sm font-semibold tracking-tight">
          Starter <span className="font-normal text-muted-foreground">Chat</span>
        </Link>
        <h1 className="mt-6 text-xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">Use your Google account to continue.</p>
        {error === undefined ? null : (
          <p
            role="alert"
            className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive"
          >
            Sign-in didn't finish. Try again.
          </p>
        )}
        <a
          href="/api/auth/sign-in"
          className={buttonVariants({ size: "lg", className: "mt-6 w-full" })}
        >
          <GoogleIcon />
          Continue with Google
        </a>
      </div>
    </main>
  );
}

/** Google's "G", in the colors its sign-in branding guidelines require. */
function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="rounded-full bg-white p-px">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.94l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}
