import type { InferEnv } from "alchemy/Cloudflare";
import type ApiWorker from "./worker.ts";

declare module "cloudflare:workers" {
  namespace Cloudflare {
    interface Env extends InferEnv<{ API: typeof ApiWorker }> {}
  }
}
