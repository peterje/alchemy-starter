import { RegistryProvider } from "@effect/atom-react";
import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
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
  pendingComponent: PendingTodos,
  component: RootComponent,
});

function PendingTodos() {
  return <p className="status">Loading todos…</p>;
}

function RootComponent() {
  return (
    <RegistryProvider>
      <Outlet />
    </RegistryProvider>
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
          <h1>Effect all the way down.</h1>
          <p className="lede">
            A schema-first Effect API persists todos in Cloudflare D1. AtomHttpApi drives every
            client query and mutation without React local state.
          </p>
          {children}
        </main>
        <Scripts />
      </body>
    </html>
  );
}
