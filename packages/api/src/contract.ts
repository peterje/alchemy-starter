import { TodosApiGroup } from "@starter/todos";
import { HttpApi } from "effect/unstable/httpapi";

/** The single HTTP API. Every domain contributes a group; every group lives under /api. */
export class StarterApi extends HttpApi.make("StarterApi").add(TodosApiGroup).prefix("/api") {}
