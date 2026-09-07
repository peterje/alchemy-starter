import { HttpApi } from "effect/unstable/httpapi";

import { ChatGroup, MembershipsGroup } from "./chats.ts";

/** Every group behind one origin. The Worker serves it by calling the objects' methods. */
export class Api extends HttpApi.make("Api").add(MembershipsGroup).add(ChatGroup).prefix("/api") {}
