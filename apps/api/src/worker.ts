import { ChatId } from "@starter/contract/chats";
import { UserId } from "@starter/contract/user";
import * as Cloudflare from "alchemy/Cloudflare";
import { Config, Effect, Schema } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/unstable/http";

import ChatRoom from "./chat-room.ts";
import UserStore from "./user-store.ts";

export default class ApiWorker extends Cloudflare.Worker<ApiWorker>()(
  "Api",
  {
    main: import.meta.url,
    workersDev: false,
    dev: { port: Config.number("API_PORT").pipe(Config.withDefault(1338)) },
  },
  Effect.gen(function* () {
    const users = yield* UserStore;
    const rooms = yield* ChatRoom;
    // Demo routing only. Select the user's object from a verified session before storing private data.
    return {
      fetch: HttpRouter.addAll([
        HttpRouter.route("*", "/api/users/:userId/*", (request) =>
          HttpRouter.schemaPathParams(Schema.Struct({ userId: UserId })).pipe(
            Effect.flatMap(({ userId }) => users.getByName(userId).fetch(request)),
            Effect.catchTag("SchemaError", () =>
              Effect.succeed(HttpServerResponse.empty({ status: 400 })),
            ),
          ),
        ),
        HttpRouter.route("*", "/api/chats/:chatId/*", (request) =>
          HttpRouter.schemaPathParams(Schema.Struct({ chatId: ChatId })).pipe(
            Effect.flatMap(({ chatId }) => rooms.getByName(chatId).fetch(request)),
            Effect.catchTag("SchemaError", () =>
              Effect.succeed(HttpServerResponse.empty({ status: 400 })),
            ),
          ),
        ),
      ]).pipe(HttpRouter.toHttpEffect),
    };
  }),
) {}
