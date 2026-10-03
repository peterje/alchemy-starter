import { Api } from "@starter/contract/api";
import { DocumentNotFound } from "@starter/contract/documents";
import { DeckNotFound } from "@starter/contract/slides";
import { CurrentUser } from "@starter/contract/user";
import { InvalidOperation } from "@starter/contract/versioning";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/http-api";

import DeckObject from "./deck-object.ts";
import DocumentObject from "./document-object.ts";
import UserStore from "./user-store.ts";

// A typed failure crosses an object stub as a plain tagged object, so each handler rebuilds the
// class from it before the API encodes the response.
const rebuild = {
  DocumentNotFound: (error: DocumentNotFound) => Effect.fail(new DocumentNotFound(error)),
  DeckNotFound: (error: DeckNotFound) => Effect.fail(new DeckNotFound(error)),
  InvalidOperation: (error: InvalidOperation) => Effect.fail(new InvalidOperation(error)),
};

export const FilesHandlers = HttpApiBuilder.group(Api, "files", (handlers) =>
  Effect.gen(function* () {
    const userStores = yield* UserStore;
    return handlers.handleAll({
      list: () => Effect.flatMap(CurrentUser, ({ id }) => userStores.getByName(id).list()),
      createDocument: ({ payload }) =>
        Effect.flatMap(CurrentUser, ({ id }) => userStores.getByName(id).createDocument(payload)),
      createDeck: ({ payload }) =>
        Effect.flatMap(CurrentUser, ({ id }) => userStores.getByName(id).createDeck(payload)),
    });
  }),
);

export const DocumentsHandlers = HttpApiBuilder.group(Api, "documents", (handlers) =>
  Effect.gen(function* () {
    const documents = yield* DocumentObject;
    return handlers.handleAll({
      get: ({ params }) =>
        Effect.flatMap(CurrentUser, ({ id }) =>
          documents.getByName(params.documentId).get({ userId: id }),
        ).pipe(Effect.catchTags({ DocumentNotFound: rebuild.DocumentNotFound })),
      set: ({ params, payload }) =>
        Effect.flatMap(CurrentUser, ({ id }) =>
          documents.getByName(params.documentId).set({ userId: id, document: payload }),
        ).pipe(Effect.catchTags({ DocumentNotFound: rebuild.DocumentNotFound })),
      apply: ({ params, payload }) =>
        Effect.flatMap(CurrentUser, ({ id }) =>
          documents.getByName(params.documentId).apply({ userId: id, operation: payload }),
        ).pipe(
          Effect.catchTags({
            DocumentNotFound: rebuild.DocumentNotFound,
            InvalidOperation: rebuild.InvalidOperation,
          }),
        ),
    });
  }),
);

export const DecksHandlers = HttpApiBuilder.group(Api, "decks", (handlers) =>
  Effect.gen(function* () {
    const decks = yield* DeckObject;
    return handlers.handleAll({
      get: ({ params }) =>
        Effect.flatMap(CurrentUser, ({ id }) =>
          decks.getByName(params.deckId).get({ userId: id }),
        ).pipe(Effect.catchTags({ DeckNotFound: rebuild.DeckNotFound })),
      set: ({ params, payload }) =>
        Effect.flatMap(CurrentUser, ({ id }) =>
          decks.getByName(params.deckId).set({ userId: id, deck: payload }),
        ).pipe(Effect.catchTags({ DeckNotFound: rebuild.DeckNotFound })),
      apply: ({ params, payload }) =>
        Effect.flatMap(CurrentUser, ({ id }) =>
          decks.getByName(params.deckId).apply({ userId: id, operation: payload }),
        ).pipe(
          Effect.catchTags({
            DeckNotFound: rebuild.DeckNotFound,
            InvalidOperation: rebuild.InvalidOperation,
          }),
        ),
    });
  }),
);
