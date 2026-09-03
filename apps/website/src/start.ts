import { createStart } from "@tanstack/react-start";

/**
 * Client-rendered by default. The Worker serves the document shell and the
 * Effect API; routes opt into SSR individually if they ever need it.
 */
export const startInstance = createStart(() => ({
  defaultSsr: false,
}));
