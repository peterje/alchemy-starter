import { HttpApi } from "effect/unstable/httpapi";

import { ChatGroup, MembershipsGroup } from "./chats.ts";

/** Served by each user's Durable Object. */
export class UserApi extends HttpApi.make("UserApi").add(MembershipsGroup).prefix("/api") {}

/** Served by each chat's Durable Object. */
export class ChatApi extends HttpApi.make("ChatApi").add(ChatGroup).prefix("/api") {}

/** What the browser sees: every object's groups behind one origin. */
export class Api extends HttpApi.make("Api").add(MembershipsGroup).add(ChatGroup).prefix("/api") {}
