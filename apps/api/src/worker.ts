import { Api } from "@starter/contract/api";
import { ChatNotFound, NotAMember } from "@starter/contract/chats";
import * as Cloudflare from "alchemy/Cloudflare";
import { Config, Effect, Layer, Schema } from "effect";
import { HttpRouter, HttpServer } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";

import ChatRoom from "./chat-room.ts";
import UserStore from "./user-store.ts";

// A typed failure crosses an object stub as a plain tagged object. Decode it back into its
// class so the API can encode it; any other failure is a defect.
const decodeError = <E>(error: Schema.ConstraintDecoder<E>) =>
  Effect.catch((failure: E) =>
    Effect.flatMap(Effect.orDie(Schema.decodeUnknownEffect(error)(failure)), Effect.fail),
  );

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
    const memberships = HttpApiBuilder.group(Api, "memberships", (handlers) =>
      handlers.handleAll({
        list: ({ params }) => users.getByName(params.userId).list(),
        create: ({ params, payload }) => users.getByName(params.userId).create(payload),
        join: ({ params }) =>
          users.getByName(params.userId).join(params.chatId).pipe(decodeError(ChatNotFound)),
      }),
    );
    const chat = HttpApiBuilder.group(Api, "chat", (handlers) =>
      handlers.handleAll({
        get: ({ params }) => rooms.getByName(params.chatId).get().pipe(decodeError(ChatNotFound)),
        messages: ({ params }) => rooms.getByName(params.chatId).messages(),
        post: ({ params, payload }) =>
          rooms.getByName(params.chatId).post(payload).pipe(decodeError(NotAMember)),
      }),
    );

    return {
      fetch: HttpApiBuilder.layer(Api).pipe(
        Layer.provide([memberships, chat]),
        Layer.provide(HttpServer.layerServices),
        HttpRouter.toHttpEffect,
      ),
    };
  }),
) {}
