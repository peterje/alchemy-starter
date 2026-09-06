import * as Cloudflare from "alchemy/Cloudflare";
import * as Test from "alchemy/Test/Bun";
import { expect } from "bun:test";
import { Effect, Result, Schema } from "effect";
import { HttpBody, HttpClient } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { Note, NotesApi, UserId } from "../apps/website/src/notes.ts";
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
  return yield* HttpApiClient.make(NotesApi, { baseUrl: websiteUrl });
});

test(
  "notes CRUD uses separate per-user SQLite databases and typed errors",
  Effect.gen(function* () {
    const api = yield* client;
    const alice = UserId.make("notes-test-alice");
    const bob = UserId.make("notes-test-bob");
    const created = yield* api.notes.create({
      params: { userId: alice },
      payload: { title: "First note", body: "SELECT is text, not SQL" },
    });
    const aliceNote = { userId: alice, id: created.id };
    const bobNote = { userId: bob, id: created.id };

    expect(created.title).toBe("First note");
    expect(created.createdAt).toBe(created.updatedAt);
    expect(yield* api.notes.get({ params: aliceNote })).toEqual(created);
    expect(yield* api.notes.list({ params: { userId: bob } })).toEqual([]);

    for (const operation of [
      api.notes.get({ params: bobNote }),
      api.notes.update({ params: bobNote, payload: { title: "Not yours", body: "" } }),
      api.notes.remove({ params: bobNote }),
    ]) {
      const result = yield* Effect.result(operation);
      expect(Result.isFailure(result) && result.failure._tag).toBe("NoteNotFound");
    }

    const updated = yield* api.notes.update({
      params: aliceNote,
      payload: { title: "Revised", body: "It's still Alice's note." },
    });
    expect(updated.id).toBe(created.id);
    expect(updated.createdAt).toBe(created.createdAt);
    expect(updated.updatedAt).toBeGreaterThanOrEqual(created.updatedAt);
    expect(yield* api.notes.list({ params: { userId: alice } })).toContainEqual(updated);
    expect(yield* api.notes.remove({ params: aliceNote })).toEqual(updated);
    const missing = yield* Effect.result(api.notes.get({ params: aliceNote }));
    expect(Result.isFailure(missing) && missing.failure._tag).toBe("NoteNotFound");
  }),
  { timeout: 120_000 },
);

test(
  "the real DO HttpApi rejects invalid payloads and path parameters",
  Effect.gen(function* () {
    const { websiteUrl } = yield* stack;
    for (const body of [
      '{"title":"   ","body":""}',
      '{"title":"Missing body"}',
      '{"title":42,"body":""}',
      '{"title":"Invalid JSON",',
      JSON.stringify({ title: "Too long", body: "x".repeat(20_001) }),
    ]) {
      const response = yield* HttpClient.post(
        `${websiteUrl}/api/users/notes-test-validation/notes/`,
        {
          body: HttpBody.text(body, "application/json"),
        },
      );
      expect(response.status).toBe(400);
    }
    const badId = yield* HttpClient.get(
      `${websiteUrl}/api/users/notes-test-validation/notes/not-a-uuid`,
    );
    expect(badId.status).toBe(400);
    const badUser = yield* HttpClient.get(`${websiteUrl}/api/users/invalid!user/notes/`);
    expect(badUser.status).toBe(400);

    const normalized = yield* HttpClient.post(
      `${websiteUrl}/api/users/notes-test-validation/notes/`,
      { body: HttpBody.jsonUnsafe({ title: "  Trim me  ", body: "" }) },
    );
    expect(normalized.status).toBe(200);
    const note = yield* normalized.json.pipe(Effect.flatMap(Schema.decodeUnknownEffect(Note)));
    expect(note.title).toBe("Trim me");
    const api = yield* client;
    yield* api.notes.remove({
      params: { userId: UserId.make("notes-test-validation"), id: note.id },
    });
  }),
  { timeout: 120_000 },
);

test(
  "concurrent requests initialize migrations once and return plain notes",
  Effect.gen(function* () {
    const { websiteUrl } = yield* stack;
    const url = `${websiteUrl}/api/users/notes-test-concurrent/notes/`;
    const notes = yield* Effect.all(
      Array.from({ length: 5 }, (_, index) =>
        HttpClient.post(url, {
          body: HttpBody.jsonUnsafe({ title: `Concurrent ${index}`, body: "" }),
        }).pipe(
          Effect.flatMap((response) => {
            expect(response.status).toBe(200);
            return response.json;
          }),
          Effect.flatMap(Schema.decodeUnknownEffect(Note)),
        ),
      ),
      { concurrency: 5 },
    );
    expect(new Set(notes.map((note) => note.id)).size).toBe(5);
    const api = yield* client;
    for (const note of notes) {
      yield* api.notes.remove({
        params: { userId: UserId.make("notes-test-concurrent"), id: note.id },
      });
    }
  }),
  { timeout: 120_000 },
);
