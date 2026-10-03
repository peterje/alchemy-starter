import { expect } from "bun:test";

import { Api } from "@starter/contract/api";
import {
  type Block,
  defaultPageSettings,
  type Document,
  DocumentId,
} from "@starter/contract/documents";
import { type Deck, DeckId } from "@starter/contract/slides";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Command from "alchemy/Command";
import * as GitHub from "alchemy/GitHub";
import * as Planetscale from "alchemy/Planetscale";
import * as Test from "alchemy/Test/Bun";
import { Config, Effect, Layer, Option, Result } from "effect";
import {
  Cookies,
  FetchHttpClient,
  HttpBody,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from "effect/http";
import { HttpApiClient } from "effect/http-api";

import Stack from "../alchemy.run.ts";
import * as WorkOS from "../stacks/workos.ts";

// Deploy the real stack into local workerd: actual Durable Object SQLite databases, the stage's
// own PlanetScale branch, and the WorkOS emulator that dev mode starts.
const { test, beforeAll, deploy } = Test.make({
  providers: Layer.mergeAll(
    Cloudflare.providers(),
    Command.providers(),
    GitHub.providers(),
    Planetscale.providers(),
    WorkOS.providers(),
  ),
  // Shared state, so the next CI run, and the cleanup job, find the stage this run left.
  state: Cloudflare.state(),
  dev: true,
});
// Creating the stage's database branch takes minutes, so the stage outlives the run: later runs
// reuse it, and closing a pull request destroys its CI stages.
const stack = beforeAll(deploy(Stack), { timeout: 600_000 });

const emulator = Config.all({
  url: Config.String("WORKOS_API_URL"),
  apiKey: Config.String("WORKOS_API_KEY"),
});

// Sign-in is a chain of redirects whose cookies carry the state, so follow them by hand.
const manualRedirects = Layer.mergeAll(
  FetchHttpClient.layer,
  Layer.succeed(FetchHttpClient.RequestInit, { redirect: "manual" }),
);
const cookie = (response: HttpClientResponse.HttpClientResponse, name: string) =>
  Option.getOrThrow(Cookies.getValue(response.cookies, name));
const location = (response: HttpClientResponse.HttpClientResponse) =>
  new URL(Option.getOrThrow(Option.fromNullishOr(response.headers["location"])));

/** A new emulator user, so tests sharing the persistent test stage never share files. */
const newUser = (name: string) =>
  Effect.gen(function* () {
    const { url, apiKey } = yield* emulator;
    const email = `${name.toLowerCase()}-${crypto.randomUUID()}@example.com`;
    yield* HttpClientRequest.post(`${url}/user_management/users`).pipe(
      HttpClientRequest.bearerToken(apiKey),
      HttpClientRequest.bodyJsonUnsafe({ email, first_name: name, email_verified: true }),
      HttpClient.execute,
      Effect.flatMap(HttpClientResponse.filterStatusOk),
    );
    return email;
  });

/** Signs in "with Google" on the emulator's login page, as a browser would; returns the cookie. */
const signIn = (email: string) =>
  Effect.gen(function* () {
    const { websiteUrl } = yield* stack;
    const start = yield* HttpClient.get(`${websiteUrl}/api/auth/sign-in`);
    const authorize = location(start);
    const chosen = yield* HttpClientRequest.post(
      new URL("/user_management/authorize", authorize),
    ).pipe(
      HttpClientRequest.bodyUrlParams({
        client_id: authorize.searchParams.get("client_id") ?? "",
        redirect_uri: authorize.searchParams.get("redirect_uri") ?? "",
        state: authorize.searchParams.get("state") ?? "",
        email,
      }),
      HttpClient.execute,
    );
    const callback = yield* HttpClientRequest.get(location(chosen)).pipe(
      HttpClientRequest.setHeader("cookie", `auth_state=${cookie(start, "auth_state")}`),
      HttpClient.execute,
    );
    return `session=${cookie(callback, "session")}`;
  }).pipe(Effect.provide(manualRedirects));

/** The API as a signed-in user. */
const clientFor = (name: string) =>
  Effect.gen(function* () {
    const { websiteUrl } = yield* stack;
    const session = yield* signIn(yield* newUser(name));
    const api = yield* HttpApiClient.make(Api, {
      baseUrl: websiteUrl,
      transformClient: HttpClient.mapRequest(HttpClientRequest.setHeader("cookie", session)),
    });
    return { api, session };
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
  "signing in with Google creates a session and records the user",
  Effect.gen(function* () {
    const { api } = yield* clientFor("Dana");

    const me = yield* api.users.me();
    expect(me.name).toBe("Dana");
    const current = yield* api.sessions.current();
    expect(current.current).toBe(true);
    expect((yield* api.sessions.list()).map(({ id }) => id)).toContain(current.id);

    yield* api.sessions.deleteCurrent();
    expect((yield* api.sessions.list()).map(({ id }) => id)).not.toContain(current.id);
  }),
  { timeout: 120_000 },
);

test(
  "the API refuses requests without a session, and callbacks without the browser's state",
  Effect.gen(function* () {
    const { websiteUrl } = yield* stack;
    for (const route of ["/api/users/me", "/api/sessions", "/api/files"]) {
      expect((yield* HttpClient.get(`${websiteUrl}${route}`)).status).toBe(401);
    }
    const forged = yield* HttpClient.get(
      `${websiteUrl}/api/auth/callback?code=stolen&state=guessed`,
    ).pipe(Effect.provide(manualRedirects));
    expect(forged.status).toBe(401);
  }),
  { timeout: 120_000 },
);

test(
  "a file belongs to whoever created it: anyone else is told it does not exist",
  Effect.gen(function* () {
    const { websiteUrl } = yield* stack;
    const { api: alice } = yield* clientFor("Alice");
    const { api: bob } = yield* clientFor("Bob");
    const file = yield* alice.files.createDocument({ payload: worksheet });
    const params = { documentId: DocumentId.make(file.id) };

    expect((yield* alice.documents.get({ params })).meta.title).toBe("Worksheet");
    const refused = { _tag: "DocumentNotFound" };
    expect(yield* Effect.flip(bob.documents.get({ params }))).toMatchObject(refused);
    expect(yield* Effect.flip(bob.documents.set({ params, payload: worksheet }))).toMatchObject(
      refused,
    );
    expect(
      yield* Effect.flip(
        bob.documents.apply({ params, payload: { operationId: "bob-edit", upserts: [] } }),
      ),
    ).toMatchObject(refused);
    expect((yield* HttpClient.get(`${websiteUrl}/api/documents/${file.id}`)).status).toBe(401);
  }),
  { timeout: 120_000 },
);

test(
  "a document object versions its blocks, replays operations, and reports conflicts",
  Effect.gen(function* () {
    const { api } = yield* clientFor("Alice");

    const file = yield* api.files.createDocument({ payload: worksheet });
    if (file.kind !== "document") throw new Error(`expected a document, got ${file.kind}`);
    expect(file.title).toBe("Worksheet");
    expect(yield* api.files.list()).toEqual([file]);
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
    const { api } = yield* clientFor("Bob");
    const file = yield* api.files.createDeck({ payload: lesson });
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
    const { api, session } = yield* clientFor("Carol");
    const file = yield* api.files.createDocument({ payload: worksheet });
    for (const request of [
      {
        url: "/files/documents",
        body: { meta: worksheet.meta, items: [{ id: "x", type: "sticker" }] },
      },
      {
        url: "/files/documents",
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
        headers: { cookie: session },
        body: HttpBody.jsonUnsafe(request.body),
      });
      expect(response.status).toBe(400);
    }
  }),
  { timeout: 120_000 },
);
