import type { InferEnv } from "alchemy/Cloudflare";
import type NotesWorker from "./worker.ts";

declare module "cloudflare:workers" {
  namespace Cloudflare {
    interface Env extends InferEnv<{ NOTES: typeof NotesWorker }> {}
  }
}
