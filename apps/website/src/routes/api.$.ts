import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

/** Keep the API same-origin; the Alchemy Worker owns the Effect API and Durable Objects. */
export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      ANY: ({ request }) => env.NOTES.fetch(request),
    },
  },
});
