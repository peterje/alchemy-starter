import { useAtom, useAtomSuspense } from "@effect/atom-react";
import { DocumentTitle } from "@starter/contract/documents";
import { DeckId, type DeckOperation, type DeckOperationResult } from "@starter/contract/slides";
import { createFileRoute, useHydrated } from "@tanstack/react-router";
import { Exit, Schema } from "effect";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import { Suspense } from "react";

import { client } from "../atoms.ts";
import { Blocks, Inlines } from "../blocks.tsx";

export const Route = createFileRoute("/decks/$deckId")({
  // A malformed ID fails here, and the route renders DeckUnavailable instead of the page.
  params: {
    parse: ({ deckId }) => ({ deckId: Schema.decodeUnknownSync(DeckId)(deckId) }),
    stringify: ({ deckId }) => ({ deckId }),
  },
  errorComponent: DeckUnavailable,
  component: DeckPage,
});

const deckAtom = (deckId: DeckId) =>
  client.query("decks", "get", { params: { deckId }, reactivityKeys: { deck: [deckId] } });
const applyAtom = client.mutation("decks", "apply");
/** What the last operation reported, shown when a write did not land as sent. */
const noticeAtom = Atom.make("");

const notice = (result: DeckOperationResult) =>
  result.status === "applied"
    ? ""
    : result.status === "partial"
      ? "Someone else changed that slide since you loaded it. Reload to see the latest."
      : "The deck changed since you loaded it. Reload and try again.";

function DeckPage() {
  const { deckId } = Route.useParams();
  return (
    <Suspense fallback={<p role="status">Loading deck…</p>}>
      <Deck deckId={deckId} />
    </Suspense>
  );
}

function Deck({ deckId }: Readonly<{ deckId: DeckId }>) {
  const hydrated = useHydrated();
  const deck = useAtomSuspense(deckAtom(deckId), { includeFailure: true });
  const [applied, apply] = useAtom(applyAtom, { mode: "promiseExit" });
  const [message, setMessage] = useAtom(noticeAtom);
  const busy = !hydrated || AsyncResult.isWaiting(applied);

  if (AsyncResult.isFailure(deck)) return <DeckUnavailable />;
  const { meta, items } = deck.value;
  const submit = async (operation: Omit<DeckOperation, "operationId">) => {
    const result = await apply({
      params: { deckId },
      payload: { operationId: crypto.randomUUID(), ...operation },
      reactivityKeys: { deck: [deckId] },
    });
    if (Exit.isSuccess(result)) setMessage(notice(result.value));
    return Exit.isSuccess(result) && result.value.status === "applied";
  };

  return (
    <section aria-label={meta.title}>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const { title } = Schema.decodeUnknownSync(Schema.Struct({ title: DocumentTitle }))(
            Object.fromEntries(new FormData(event.currentTarget)),
          );
          await submit({ meta: { title } });
        }}
      >
        <label htmlFor="title">Title</label>
        <input
          id="title"
          name="title"
          key={meta.title}
          defaultValue={meta.title}
          disabled={busy}
          required
          pattern=".*\S.*"
          maxLength={200}
        />
        <button type="submit" disabled={busy}>
          Rename
        </button>
      </form>
      <p className="hint">
        Revision {deck.value.revision} · {items.length} slides
      </p>
      {message === "" ? null : (
        <p role="alert" className="error">
          {message}
        </p>
      )}
      <ol className="slides" aria-label="Slides">
        {items.map(({ version, item }, index) => (
          <li key={item.id}>
            <article className={`slide ${item.layout}`} aria-label={`Slide ${index + 1}`}>
              {item.title === undefined ? null : (
                <h2>
                  <Inlines inlines={item.title} />
                </h2>
              )}
              {item.subtitle === undefined ? null : (
                <p className="hint">
                  <Inlines inlines={item.subtitle} />
                </p>
              )}
              <Blocks blocks={item.body} />
              {item.secondary === undefined ? null : <Blocks blocks={item.secondary} />}
              {item.notes === undefined ? null : <p className="hint">Notes: {item.notes}</p>}
              <button
                type="button"
                className="delete"
                disabled={busy}
                onClick={() => submit({ deletes: [{ id: item.id, baseVersion: version }] })}
              >
                Delete slide
              </button>
            </article>
          </li>
        ))}
      </ol>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const { title } = Schema.decodeUnknownSync(Schema.Struct({ title: DocumentTitle }))(
            Object.fromEntries(new FormData(form)),
          );
          const landed = await submit({
            upserts: [
              {
                baseVersion: 0,
                item: {
                  id: crypto.randomUUID(),
                  layout: "content",
                  title: [{ type: "text", text: title }],
                  body: [],
                },
              },
            ],
          });
          if (landed) form.reset();
        }}
      >
        <label htmlFor="slide-title">New slide</label>
        <input
          id="slide-title"
          name="title"
          disabled={busy}
          required
          pattern=".*\S.*"
          maxLength={200}
          placeholder="Slide title"
        />
        <button type="submit" disabled={busy}>
          Add slide
        </button>
      </form>
    </section>
  );
}

function DeckUnavailable() {
  return (
    <p role="alert" className="error">
      Could not load this deck. Check the URL or reload to try again.
    </p>
  );
}
