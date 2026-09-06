import { createStart } from "@tanstack/react-start";

/**
 * Render matching routes on the first request so the notes UI is in the HTML.
 * Client-only routes can still set `ssr: false`.
 */
export const startInstance = createStart(() => ({
  defaultSsr: true,
}));
