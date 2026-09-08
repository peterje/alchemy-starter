import { Api } from "@starter/contract/api";
import { ChatNotFound, NotAMember } from "@starter/contract/chats";
import { DocumentNotFound } from "@starter/contract/documents";
import { DeckNotFound } from "@starter/contract/slides";
import { InvalidOperation } from "@starter/contract/versioning";
import * as Cloudflare from "alchemy/Cloudflare";
import { Config, Effect, Layer } from "effect";
import { HttpRouter, HttpServer } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";

import ChatRoom from "./chat-room.ts";
import DeckObject from "./deck-object.ts";
import DocumentObject from "./document-object.ts";
import UserStore from "./user-store.ts";

// A typed failure crosses an object stub as a plain tagged object, so each handler rebuilds
// the class before the API encodes it. Goes away with alchemy-run/alchemy#1513.

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
    const documents = yield* DocumentObject;
    const decks = yield* DeckObject;

    // Demo routing only. Select the user's object from a verified session before storing private data.
    const memberships = HttpApiBuilder.group(Api, "memberships", (handlers) =>
      handlers.handleAll({
        list: ({ params }) => users.getByName(params.userId).list(),
        create: ({ params, payload }) => users.getByName(params.userId).create(payload),
        join: ({ params }) =>
          users
            .getByName(params.userId)
            .join(params.chatId)
            .pipe(
              Effect.catchTag("ChatNotFound", (error) =>
                Effect.fail(new ChatNotFound({ id: error.id })),
              ),
            ),
      }),
    );
    const files = HttpApiBuilder.group(Api, "files", (handlers) =>
      handlers.handleAll({
        list: ({ params }) => users.getByName(params.userId).listFiles(),
        createDocument: ({ params, payload }) =>
          users.getByName(params.userId).createDocument(payload),
        createDeck: ({ params, payload }) => users.getByName(params.userId).createDeck(payload),
      }),
    );
    const documentsGroup = HttpApiBuilder.group(Api, "documents", (handlers) =>
      handlers.handleAll({
        get: ({ params }) =>
          documents
            .getByName(params.documentId)
            .get()
            .pipe(
              Effect.catchTag("DocumentNotFound", (error) =>
                Effect.fail(new DocumentNotFound({ id: error.id })),
              ),
            ),
        set: ({ params, payload }) => documents.getByName(params.documentId).set(payload),
        apply: ({ params, payload }) =>
          documents
            .getByName(params.documentId)
            .apply(payload)
            .pipe(
              Effect.catchTag("DocumentNotFound", (error) =>
                Effect.fail(new DocumentNotFound({ id: error.id })),
              ),
              Effect.catchTag("InvalidOperation", (error) =>
                Effect.fail(
                  new InvalidOperation({ operationId: error.operationId, message: error.message }),
                ),
              ),
            ),
      }),
    );
    const decksGroup = HttpApiBuilder.group(Api, "decks", (handlers) =>
      handlers.handleAll({
        get: ({ params }) =>
          decks
            .getByName(params.deckId)
            .get()
            .pipe(
              Effect.catchTag("DeckNotFound", (error) =>
                Effect.fail(new DeckNotFound({ id: error.id })),
              ),
            ),
        set: ({ params, payload }) => decks.getByName(params.deckId).set(payload),
        apply: ({ params, payload }) =>
          decks
            .getByName(params.deckId)
            .apply(payload)
            .pipe(
              Effect.catchTag("DeckNotFound", (error) =>
                Effect.fail(new DeckNotFound({ id: error.id })),
              ),
              Effect.catchTag("InvalidOperation", (error) =>
                Effect.fail(
                  new InvalidOperation({ operationId: error.operationId, message: error.message }),
                ),
              ),
            ),
      }),
    );
    const chat = HttpApiBuilder.group(Api, "chat", (handlers) =>
      handlers.handleAll({
        get: ({ params }) =>
          rooms
            .getByName(params.chatId)
            .get()
            .pipe(
              Effect.catchTag("ChatNotFound", (error) =>
                Effect.fail(new ChatNotFound({ id: error.id })),
              ),
            ),
        messages: ({ params }) => rooms.getByName(params.chatId).messages(),
        post: ({ params, payload }) =>
          rooms
            .getByName(params.chatId)
            .post(payload)
            .pipe(
              Effect.catchTag("NotAMember", (error) =>
                Effect.fail(new NotAMember({ chatId: error.chatId, userId: error.userId })),
              ),
            ),
      }),
    );

    return {
      fetch: HttpApiBuilder.layer(Api).pipe(
        Layer.provide([memberships, files, chat, documentsGroup, decksGroup]),
        Layer.provide(HttpServer.layerServices),
        HttpRouter.toHttpEffect,
      ),
    };
  }),
) {}
