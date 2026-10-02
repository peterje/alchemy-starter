import { RegistryProvider, useAtom, useAtomSuspense } from "@effect/atom-react";
import { UserId, UserName } from "@starter/contract/user";
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
  useHydrated,
} from "@tanstack/react-router";
import { Exit, Schema } from "effect";
import { AsyncResult } from "effect/reactivity";
import { type ReactNode, Suspense } from "react";

import { client, userAtom } from "../atoms.ts";

import "../styles.css";

/** Root document route for the starter demo. */
const usersAtom = client.query("users", "list", { reactivityKeys: ["users"] });
const createUserAtom = client.mutation("users", "create");

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
      <Suspense fallback={<p role="status">Loading users…</p>}>
        <UserPicker />
      </Suspense>
      <Outlet />
    </RegistryProvider>
  );
}

function UserPicker() {
  const hydrated = useHydrated();
  const [userId, selectUser] = useAtom(userAtom);
  const users = useAtomSuspense(usersAtom, { includeFailure: true });
  const [created, createUser] = useAtom(createUserAtom, { mode: "promiseExit" });
  const busy = !hydrated || AsyncResult.isWaiting(created);
  if (AsyncResult.isFailure(users)) {
    return (
      <p role="alert" className="error">
        Could not load users. Reload to try again.
      </p>
    );
  }
  return (
    <>
      <label className="user-picker">
        Demo user
        <select
          value={userId}
          disabled={!hydrated}
          onChange={(event) => selectUser(UserId.make(event.currentTarget.value))}
        >
          {users.value.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </select>
      </label>
      <form
        className="user-picker"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          // The input's constraint attributes mirror UserName, so a decode failure is a bug, not user error.
          const name = Schema.decodeUnknownSync(UserName)(new FormData(form).get("name"));
          const result = await createUser({ payload: { name }, reactivityKeys: ["users"] });
          if (Exit.isSuccess(result)) {
            form.reset();
            selectUser(result.value.id);
          }
        }}
      >
        <label htmlFor="new-user">New user</label>
        <input
          id="new-user"
          name="name"
          disabled={busy}
          required
          pattern=".*\S.*"
          maxLength={80}
          placeholder="Carol"
        />
        <button type="submit" disabled={busy}>
          Add user
        </button>
      </form>
      {AsyncResult.isFailure(created) ? (
        <p role="alert" className="error">
          Could not add the user. Try again.
        </p>
      ) : null}
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
