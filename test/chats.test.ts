import * as Cloudflare from "alchemy/Cloudflare";
import * as Test from "alchemy/Test/Bun";
import { expect } from "bun:test";
import { Effect, Result, Schema } from "effect";
import { HttpBody, HttpClient, HttpClientResponse } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { Api } from "@starter/contract/api";
import { ChatId, Membership, Message } from "@starter/contract/chats";
import { UserId } from "@starter/contract/user";
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

test(
  "a chat object owns its members and messages; user objects index memberships",
  Effect.gen(function* () {
    const api = yield* client;
    const alice = UserId.make("chats-test-alice");
    const bob = UserId.make("chats-test-bob");

    const created = yield* api.memberships.create({
      params: { userId: alice },
      payload: { title: "Standup" },
    });
    const chatId = created.chatId;
    expect(created.title).toBe("Standup");
    expect(yield* api.chat.get({ params: { chatId } })).toEqual({
      id: chatId,
      title: "Standup",
      createdAt: expect.any(Number),
      members: [alice],
    });
    expect(yield* api.memberships.list({ params: { userId: alice } })).toEqual([created]);
    expect(yield* api.memberships.list({ params: { userId: bob } })).toEqual([]);

    const outsider = yield* Effect.result(
      api.chat.post({ params: { chatId }, payload: { author: bob, body: "Hi" } }),
    );
    expect(Result.isFailure(outsider) && outsider.failure._tag).toBe("NotAMember");

    const joined = yield* api.memberships.join({ params: { userId: bob, chatId } });
    expect(joined).toEqual({ chatId, title: "Standup", joinedAt: expect.any(Number) });
    expect(yield* api.memberships.join({ params: { userId: bob, chatId } })).toEqual(joined);
    expect((yield* api.chat.get({ params: { chatId } })).members).toEqual([alice, bob]);
    expect(yield* api.memberships.list({ params: { userId: bob } })).toEqual([joined]);

    const hello = yield* api.chat.post({
      params: { chatId },
      payload: { author: bob, body: "Hello from Bob" },
    });
    expect(yield* api.chat.messages({ params: { chatId } })).toEqual([hello]);

    const unknown = ChatId.make(crypto.randomUUID());
    const missingChat = yield* Effect.result(api.chat.get({ params: { chatId: unknown } }));
    expect(Result.isFailure(missingChat) && missingChat.failure._tag).toBe("ChatNotFound");
    const missingJoin = yield* Effect.result(
      api.memberships.join({ params: { userId: alice, chatId: unknown } }),
    );
    expect(Result.isFailure(missingJoin) && missingJoin.failure._tag).toBe("ChatNotFound");
  }),
  { timeout: 120_000 },
);

test(
  "the objects reject invalid payloads and path parameters",
  Effect.gen(function* () {
    const { websiteUrl } = yield* stack;
    const api = yield* client;
    const alice = UserId.make("chats-test-validation");
    const { chatId } = yield* api.memberships.create({
      params: { userId: alice },
      payload: { title: "Validation" },
    });
    for (const request of [
      { url: `/users/${alice}/chats/`, body: '{"title":"   "}' },
      { url: `/users/${alice}/chats/`, body: '{"title":42}' },
      { url: `/chats/${chatId}/messages`, body: `{"author":"${alice}","body":""}` },
      { url: `/chats/${chatId}/messages`, body: '{"body":"Missing author"}' },
      { url: `/chats/${chatId}/messages`, body: `{"author":"${alice}",` },
    ]) {
      const response = yield* HttpClient.post(`${websiteUrl}/api${request.url}`, {
        body: HttpBody.text(request.body, "application/json"),
      });
      expect(response.status).toBe(400);
    }
    expect((yield* HttpClient.get(`${websiteUrl}/api/chats/not-a-uuid/`)).status).toBe(400);
    expect((yield* HttpClient.get(`${websiteUrl}/api/users/invalid!user/chats/`)).status).toBe(400);

    const padded = yield* HttpClient.post(`${websiteUrl}/api/users/${alice}/chats/`, {
      body: HttpBody.jsonUnsafe({ title: "  Trim me  " }),
    });
    expect(padded.status).toBe(200);
    const membership = yield* padded.json.pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(Membership)),
    );
    expect(membership.title).toBe("Trim me");
  }),
  { timeout: 120_000 },
);

test(
  "concurrent posts to one chat are serialized by its object",
  Effect.gen(function* () {
    const { websiteUrl } = yield* stack;
    const api = yield* client;
    const alice = UserId.make("chats-test-concurrent");
    const { chatId } = yield* api.memberships.create({
      params: { userId: alice },
      payload: { title: "Concurrent" },
    });
    const posted = yield* Effect.all(
      Array.from({ length: 5 }, (_, index) =>
        HttpClient.post(`${websiteUrl}/api/chats/${chatId}/messages`, {
          body: HttpBody.jsonUnsafe({ author: alice, body: `Message ${index}` }),
        }).pipe(
          Effect.flatMap((response) => {
            expect(response.status).toBe(200);
            return HttpClientResponse.schemaBodyJson(Message)(response);
          }),
        ),
      ),
      { concurrency: 5 },
    );
    expect(new Set(posted.map((message) => message.id)).size).toBe(5);
    const messages = yield* api.chat.messages({ params: { chatId } });
    expect(messages.map((message) => message.id).sort()).toEqual(
      posted.map((message) => message.id).sort(),
    );
    expect(messages.map((message) => message.createdAt)).toEqual(
      messages.map((message) => message.createdAt).sort((a, b) => a - b),
    );
  }),
  { timeout: 120_000 },
);
