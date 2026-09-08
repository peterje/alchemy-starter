import { RegistryProvider, useAtom } from "@effect/atom-react";
import { UserId } from "@starter/contract/user";
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
  useHydrated,
} from "@tanstack/react-router";
import type { ReactNode } from "react";

import { userAtom } from "../atoms.ts";

import "../styles.css";

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
      <UserPicker />
      <Outlet />
    </RegistryProvider>
  );
}

function UserPicker() {
  const hydrated = useHydrated();
  const [userId, selectUser] = useAtom(userAtom);
  return (
    <>
      <label className="user-picker">
        Demo user
        <select
          value={userId}
          disabled={!hydrated}
          onChange={(event) => selectUser(UserId.make(event.currentTarget.value))}
        >
          <option value="alice">Alice</option>
          <option value="bob">Bob</option>
        </select>
      </label>
      <p className="hint">
        Public demo — switching users is not authentication. Don’t store private data.
      </p>
    </>
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
