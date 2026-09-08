import { expect } from "bun:test";

import { Api } from "@starter/contract/api";
import {
  type Block,
  defaultPageSettings,
  type Document,
  DocumentId,
} from "@starter/contract/documents";
import { type Deck, DeckId } from "@starter/contract/slides";
import { UserId } from "@starter/contract/user";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Test from "alchemy/Test/Bun";
import { Effect, Result } from "effect";
import { HttpBody, HttpClient } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";

import Stack from "../alchemy.run.ts";

// Deploy the real stack into local workerd, including actual Durable Object SQLite databases.
const { test, beforeAll, afterAll, deploy, destroy } = Test.make({
  providers: Cloudflare.providers(),
  dev: true,
  stage: "api-test",
});
const stack = beforeAll(deploy(Stack));
afterAll(destroy(Stack));

const client = Effect.gen(function* () {
  const { websiteUrl } = yield* stack;
  return yield* HttpApiClient.make(Api, { baseUrl: websiteUrl });
});

const paragraph = (id: string, text: string): Block => ({
  id,
  type: "paragraph",
  inlines: [{ type: "text", text }],
});
const worksheet: Document = {
  meta: { title: "Worksheet", page: defaultPageSettings },
  items: [paragraph("intro", "Solve each equation."), paragraph("q1", "3x + 7 = 22")],
};
const lesson: Deck = {
  meta: { title: "Lesson" },
  items: [{ id: "cover", layout: "title", title: [{ type: "text", text: "Lesson" }], body: [] }],
};

test(
  "a document object versions its blocks, replays operations, and reports conflicts",
  Effect.gen(function* () {
    const api = yield* client;
    const alice = UserId.make("files-test-alice");

    const file = yield* api.files.createDocument({ params: { userId: alice }, payload: worksheet });
    if (file.kind !== "document") throw new Error(`expected a document, got ${file.kind}`);
    expect(file.title).toBe("Worksheet");
    expect(yield* api.files.list({ params: { userId: alice } })).toEqual([file]);
    const documentId = file.id;
    const apply = (payload: Parameters<typeof api.documents.apply>[0]["payload"]) =>
      api.documents.apply({ params: { documentId }, payload });

    const initial = yield* api.documents.get({ params: { documentId } });
    expect(initial.revision).toBe(1);
    expect(initial.items.map((entry) => entry.version)).toEqual([1, 1]);

    const edit = {
      operationId: "edit-1",
      upserts: [
        { baseVersion: 1, item: paragraph("q1", "3x + 7 = 25") },
        { baseVersion: 0, item: paragraph("q2", "x / 4 = 2") },
      ],
    };
    const edited = yield* apply(edit);
    expect(edited.status).toBe("applied");
    expect(edited.revision).toBe(2);
    expect(edited.applied.map((entry) => entry.version)).toEqual([2, 1]);
    expect(edited.order).toEqual(["intro", "q1", "q2"]);
    expect(yield* apply(edit)).toEqual(edited);

    const stale = yield* apply({
      operationId: "edit-2",
      upserts: [{ baseVersion: 1, item: paragraph("q1", "stale") }],
    });
    expect(stale.status).toBe("partial");
    expect(stale.revision).toBe(2);
    expect(stale.conflicts.map((conflict) => [conflict.id, conflict.current?.version])).toEqual([
      ["q1", 2],
    ]);

    const rejected = yield* apply({
      operationId: "cas",
      expectedRevision: 1,
      meta: { ...worksheet.meta, title: "Should not apply" },
    });
    expect(rejected.status).toBe("rejected");

    const reordered = yield* apply({
      operationId: "reorder",
      deletes: [{ id: "intro", baseVersion: 1 }],
      order: ["q2", "q1"],
      meta: { ...worksheet.meta, title: "Worksheet v2" },
    });
    expect(reordered.status).toBe("applied");
    const current = yield* api.documents.get({ params: { documentId } });
    expect(current.revision).toBe(3);
    expect(current.meta.title).toBe("Worksheet v2");
    expect(current.items.map((entry) => entry.item.id)).toEqual(["q2", "q1"]);

    const invalid = yield* Effect.result(
      apply({
        operationId: "bad",
        upserts: [{ baseVersion: 0, item: paragraph("dup", "a") }],
        deletes: [{ id: "dup", baseVersion: 1 }],
      }),
    );
    expect(Result.isFailure(invalid) && invalid.failure._tag).toBe("InvalidOperation");

    const replaced = yield* api.documents.set({ params: { documentId }, payload: worksheet });
    expect(replaced.revision).toBe(4);
    expect(replaced.items.map((entry) => entry.version)).toEqual([1, 1]);
    // Replacing the file clears the replay history, so the same operation applies fresh.
    expect((yield* apply(edit)).revision).toBe(5);

    const unknown = DocumentId.make(crypto.randomUUID());
    const missing = yield* Effect.result(api.documents.get({ params: { documentId: unknown } }));
    expect(Result.isFailure(missing) && missing.failure._tag).toBe("DocumentNotFound");
    const missingApply = yield* Effect.result(
      api.documents.apply({ params: { documentId: unknown }, payload: { operationId: "x" } }),
    );
    expect(Result.isFailure(missingApply) && missingApply.failure._tag).toBe("DocumentNotFound");
  }),
  { timeout: 120_000 },
);

test(
  "a deck object versions its slides",
  Effect.gen(function* () {
    const api = yield* client;
    const bob = UserId.make("files-test-bob");
    const file = yield* api.files.createDeck({ params: { userId: bob }, payload: lesson });
    if (file.kind !== "deck") throw new Error(`expected a deck, got ${file.kind}`);
    const deckId = file.id;

    const added = yield* api.decks.apply({
      params: { deckId },
      payload: {
        operationId: "add",
        upserts: [{ baseVersion: 0, item: { id: "objectives", layout: "content", body: [] } }],
      },
    });
    expect(added.status).toBe("applied");
    expect(added.order).toEqual(["cover", "objectives"]);

    const stale = yield* api.decks.apply({
      params: { deckId },
      payload: { operationId: "remove", deletes: [{ id: "cover", baseVersion: 2 }] },
    });
    expect(stale.status).toBe("partial");
    expect((yield* api.decks.get({ params: { deckId } })).items).toHaveLength(2);

    const unknown = DeckId.make(crypto.randomUUID());
    const missing = yield* Effect.result(api.decks.get({ params: { deckId: unknown } }));
    expect(Result.isFailure(missing) && missing.failure._tag).toBe("DeckNotFound");
  }),
  { timeout: 120_000 },
);

test(
  "the objects reject content that does not match the schema",
  Effect.gen(function* () {
    const { websiteUrl } = yield* stack;
    const api = yield* client;
    const carol = UserId.make("files-test-carol");
    const file = yield* api.files.createDocument({ params: { userId: carol }, payload: worksheet });
    for (const request of [
      {
        url: `/users/${carol}/files/documents`,
        body: { meta: worksheet.meta, items: [{ id: "x", type: "sticker" }] },
      },
      {
        url: `/users/${carol}/files/documents`,
        body: { meta: worksheet.meta, items: [paragraph("same", "a"), paragraph("same", "b")] },
      },
      {
        url: `/documents/${file.id}/operations`,
        body: { operationId: "has spaces", upserts: [] },
      },
      {
        url: `/documents/${file.id}/operations`,
        body: {
          operationId: "bad-block",
          upserts: [{ baseVersion: 0, item: { id: "t", type: "table", rows: [] } }],
        },
      },
    ]) {
      const response = yield* HttpClient.post(`${websiteUrl}/api${request.url}`, {
        body: HttpBody.jsonUnsafe(request.body),
      });
      expect(response.status).toBe(400);
    }
  }),
  { timeout: 120_000 },
);
