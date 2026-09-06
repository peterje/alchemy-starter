import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen.ts";

/** Create the TanStack router used by the browser and server renderers. */
export function getRouter() {
  return createRouter({ routeTree, scrollRestoration: false });
}
