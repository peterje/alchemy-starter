import { RegistryProvider, useAtom } from "@effect/atom-react";
import { HeadContent, Outlet, Scripts, createRootRoute, useHydrated } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { userAtom } from "../atoms.ts";
import { UserId } from "../store.ts";
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
  return (
    <RegistryProvider>
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
        <main className="demo-app">
          <p className="eyebrow">Alchemy + Effect starter</p>
          <h1>Your notes, your object.</h1>
          <p className="lede">
            A schema-first Effect API stores each user's notes in a Durable Object with SQLite.
            AtomHttpApi drives queries and mutations. No ORM.
          </p>
          {children}
        </main>
        <Scripts />
      </body>
    </html>
  );
}
