import { RegistryProvider, useAtom, useAtomSuspense } from "@effect/atom-react";
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
  useHydrated,
} from "@tanstack/react-router";
import { AsyncResult } from "effect/reactivity";
import { type ReactNode, Suspense } from "react";

import { client, meAtom } from "../atoms.ts";

import "../styles.css";

const signOutAtom = client.mutation("sessions", "deleteCurrent");

/** Root document route for the starter demo. */
export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Alchemy + Effect starter" },
    ],
  }),
  // The Worker always emits this document. Page chrome lives here so the LCP
  // heading is in the first HTML even when a child route is client-rendered.
  shellComponent: Document,
  component: RootComponent,
});

function RootComponent() {
  // The provider does not inherit the package default, which sweeps unused atoms after 400ms.
  return (
    <RegistryProvider defaultIdleTTL={400}>
      <Suspense fallback={<p role="status">Loading your account…</p>}>
        <Account />
      </Suspense>
      <Outlet />
    </RegistryProvider>
  );
}

function Account() {
  const hydrated = useHydrated();
  const me = useAtomSuspense(meAtom, { includeFailure: true });
  const [signingOut, signOut] = useAtom(signOutAtom, { mode: "promiseExit" });
  // Signing in is a full-page navigation: Google and WorkOS redirect back to the callback, which
  // creates the session cookie.
  if (AsyncResult.isFailure(me)) {
    return (
      <p className="account">
        <a className="button" href="/api/auth/sign-in">
          Sign in with Google
        </a>
      </p>
    );
  }
  return (
    <p className="account">
      Signed in as <strong>{me.value.name}</strong>
      <button
        type="button"
        disabled={!hydrated || AsyncResult.isWaiting(signingOut)}
        onClick={() => signOut({ reactivityKeys: ["me", "files"] })}
      >
        Sign out
      </button>
    </p>
  );
}

function Document({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <main>
          <p className="eyebrow">
            <Link to="/">Alchemy + Effect starter</Link>
          </p>
          <h1>Every document and deck is an object.</h1>
          <p>
            Each file is a Durable Object with its own SQLite database and a single writer. Each
            user's object indexes the files they created. No ORM.
          </p>
          {children}
        </main>
        <Scripts />
      </body>
    </html>
  );
}
