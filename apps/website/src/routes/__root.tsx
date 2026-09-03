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
  // Routes are client-rendered (see start.ts), so the document must be the
  // shell component: it is the only part the Worker renders on the server.
  shellComponent: Document,
  component: RootComponent,
});

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
        {children}
        <Scripts />
      </body>
    </html>
  );
}
