import type { InferEnv } from "alchemy/Cloudflare";

import type { Website } from "../../../alchemy.run.ts";

declare module "cloudflare:workers" {
  namespace Cloudflare {
    interface Env extends InferEnv<typeof Website> {}
  }
}
