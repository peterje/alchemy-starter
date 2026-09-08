import { useAtom, useAtomSuspense, useAtomValue } from "@effect/atom-react";
import {
  type Document,
  defaultPageSettings,
  DocumentTitle,
  type Inline,
} from "@starter/contract/documents";
import type { Deck } from "@starter/contract/slides";
import type { UserId } from "@starter/contract/user";
import { createFileRoute, Link, useHydrated, useNavigate } from "@tanstack/react-router";
import { Exit, Schema } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { Suspense } from "react";

import { client, userAtom } from "../atoms.ts";

export const Route = createFileRoute("/files")({ component: FilesPage });

const filesAtom = (userId: UserId) =>
  client.query("files", "list", { params: { userId }, reactivityKeys: { files: [userId] } });
const createDocumentAtom = client.mutation("files", "createDocument");
const createDeckAtom = client.mutation("files", "createDeck");

const NewFile = Schema.Struct({
  kind: Schema.Literals(["document", "deck"]),
  title: DocumentTitle,
});

const text = (value: string): ReadonlyArray<Inline> => [{ type: "text", text: value }];

/** A new file starts with one item so its page is never empty. */
const newDocument = (title: string): Document => ({
  meta: { title, page: defaultPageSettings },
  items: [{ id: crypto.randomUUID(), type: "paragraph", inlines: text("Start writing.") }],
});
const newDeck = (title: string): Deck => ({
  meta: { title },
  items: [{ id: crypto.randomUUID(), layout: "title", title: text(title), body: [] }],
});

function FilesPage() {
  return (
    <Suspense fallback={<p role="status">Loading files…</p>}>
      <Files />
    </Suspense>
  );
}

function Files() {
  const hydrated = useHydrated();
  const navigate = useNavigate();
  const userId = useAtomValue(userAtom);
  const files = useAtomSuspense(filesAtom(userId), { includeFailure: true });
  const [createdDocument, createDocument] = useAtom(createDocumentAtom, { mode: "promiseExit" });
  const [createdDeck, createDeck] = useAtom(createDeckAtom, { mode: "promiseExit" });
  const creating = AsyncResult.isWaiting(createdDocument) || AsyncResult.isWaiting(createdDeck);
  const failed = AsyncResult.isFailure(createdDocument) || AsyncResult.isFailure(createdDeck);
  const busy = !hydrated || creating;

  return (
    <section key={userId} aria-label={`${userId}'s files`}>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          // The inputs' constraint attributes mirror NewFile, so a decode failure is a bug, not user error.
          const input = Schema.decodeUnknownSync(NewFile)(
            Object.fromEntries(new FormData(event.currentTarget)),
          );
          const keys = { files: [userId] };
          switch (input.kind) {
            case "document": {
              const result = await createDocument({
                params: { userId },
                payload: newDocument(input.title),
                reactivityKeys: keys,
              });
              if (Exit.isSuccess(result) && result.value.kind === "document") {
                await navigate({
                  to: "/documents/$documentId",
                  params: { documentId: result.value.id },
                });
              }
              return;
            }
            case "deck": {
              const result = await createDeck({
                params: { userId },
                payload: newDeck(input.title),
                reactivityKeys: keys,
              });
              if (Exit.isSuccess(result) && result.value.kind === "deck") {
                await navigate({ to: "/decks/$deckId", params: { deckId: result.value.id } });
              }
              return;
            }
            default: {
              const exhaustive: never = input.kind;
              return exhaustive;
            }
          }
        }}
      >
        <label htmlFor="title">New file</label>
        <input
          id="title"
          name="title"
          disabled={busy}
          required
          pattern=".*\S.*"
          maxLength={200}
          placeholder="Unit 2 quiz"
        />
        <label htmlFor="kind">Kind</label>
        <select id="kind" name="kind" disabled={busy}>
          <option value="document">Document</option>
          <option value="deck">Slide deck</option>
        </select>
        <button type="submit" disabled={busy}>
          {creating ? "Creating…" : "Create file"}
        </button>
      </form>
      {failed ? (
        <p role="alert" className="error">
          Could not create the file. Your title is still here — try again.
        </p>
      ) : null}
      {AsyncResult.isFailure(files) ? (
        <p role="alert" className="error">
          Could not load your files. Reload to try again.
        </p>
      ) : (
        <>
          {files.value.length === 0 ? (
            <p className="empty">No files yet. Create your first one.</p>
          ) : null}
          <ul aria-label="Your files">
            {files.value.map((file) => (
              <li key={file.id}>
                {file.kind === "document" ? (
                  <Link to="/documents/$documentId" params={{ documentId: file.id }}>
                    {file.title}
                  </Link>
                ) : (
                  <Link to="/decks/$deckId" params={{ deckId: file.id }}>
                    {file.title}
                  </Link>
                )}
                <span className="hint"> · {file.kind}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
