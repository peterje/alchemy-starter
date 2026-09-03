import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";

/** Page origin for both the browser and workerd SSR. */
export const pageOrigin = createIsomorphicFn()
  .client(() => globalThis.location.origin)
  .server(() => getRequestUrl().origin);
