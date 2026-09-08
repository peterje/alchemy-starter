import { useAtom, useAtomSuspense } from "@effect/atom-react";
import {
  DocumentId,
  type DocumentOperation,
  type DocumentOperationResult,
  DocumentTitle,
  type ParagraphBlock,
} from "@starter/contract/documents";
import { createFileRoute, useHydrated } from "@tanstack/react-router";
import { Exit, Schema } from "effect";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import { Suspense } from "react";

import { client } from "../atoms.ts";
import { Blocks } from "../blocks.tsx";

export const Route = createFileRoute("/documents/$documentId")({
  // A malformed ID fails here, and the route renders DocumentUnavailable instead of the page.
  params: {
    parse: ({ documentId }) => ({ documentId: Schema.decodeUnknownSync(DocumentId)(documentId) }),
    stringify: ({ documentId }) => ({ documentId }),
  },
  errorComponent: DocumentUnavailable,
  component: DocumentPage,
});

const documentAtom = (documentId: DocumentId) =>
  client.query("documents", "get", {
    params: { documentId },
    reactivityKeys: { document: [documentId] },
  });
const applyAtom = client.mutation("documents", "apply");
/** What the last operation reported, shown when a write did not land as sent. */
const noticeAtom = Atom.make("");

const Text = Schema.Struct({ text: Schema.String.check(Schema.isMaxLength(50_000)) });
const paragraphText = (block: ParagraphBlock) =>
  block.inlines.map((inline) => (inline.type === "text" ? inline.text : "")).join("");
const notice = (result: DocumentOperationResult) =>
  result.status === "applied"
    ? ""
    : result.status === "partial"
      ? "Someone else changed that block since you loaded it. Reload to see the latest."
      : "The document changed since you loaded it. Reload and try again.";

function DocumentPage() {
  const { documentId } = Route.useParams();
  return (
    <Suspense fallback={<p role="status">Loading document…</p>}>
      <Document documentId={documentId} />
    </Suspense>
  );
}

function Document({ documentId }: Readonly<{ documentId: DocumentId }>) {
  const hydrated = useHydrated();
  const document = useAtomSuspense(documentAtom(documentId), { includeFailure: true });
  const [applied, apply] = useAtom(applyAtom, { mode: "promiseExit" });
  const [message, setMessage] = useAtom(noticeAtom);
  const busy = !hydrated || AsyncResult.isWaiting(applied);

  if (AsyncResult.isFailure(document)) return <DocumentUnavailable />;
  const { meta, items } = document.value;
  const submit = async (operation: Omit<DocumentOperation, "operationId">) => {
    const result = await apply({
      params: { documentId },
      payload: { operationId: crypto.randomUUID(), ...operation },
      reactivityKeys: { document: [documentId] },
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
          await submit({ meta: { ...meta, title } });
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
        Revision {document.value.revision} · {items.length} blocks · page {meta.page.size},{" "}
        {meta.page.orientation}
      </p>
      {message === "" ? null : (
        <p role="alert" className="error">
          {message}
        </p>
      )}
      <article className="blocks" aria-label="Blocks">
        {items.map(({ version, item }) => (
          <div key={item.id}>
            <Blocks blocks={[item]} />
            {item.type === "paragraph" ? (
              <details>
                <summary>Edit paragraph</summary>
                <form
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const form = event.currentTarget;
                    const { text } = Schema.decodeUnknownSync(Text)(
                      Object.fromEntries(new FormData(form)),
                    );
                    // The version the edit was based on; a stale one comes back as a conflict.
                    const landed = await submit({
                      upserts: [
                        {
                          baseVersion: version,
                          item: { ...item, inlines: [{ type: "text", text }] },
                        },
                      ],
                    });
                    if (landed) form.closest("details")?.removeAttribute("open");
                  }}
                >
                  <label htmlFor={`text-${item.id}`}>Text</label>
                  <textarea
                    id={`text-${item.id}`}
                    name="text"
                    defaultValue={paragraphText(item)}
                    disabled={busy}
                    rows={3}
                    maxLength={50_000}
                  />
                  <button type="submit" disabled={busy}>
                    Save paragraph
                  </button>
                </form>
              </details>
            ) : null}
          </div>
        ))}
      </article>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const { text } = Schema.decodeUnknownSync(Text)(Object.fromEntries(new FormData(form)));
          const landed = await submit({
            upserts: [
              {
                baseVersion: 0,
                item: {
                  id: crypto.randomUUID(),
                  type: "paragraph",
                  inlines: [{ type: "text", text }],
                },
              },
            ],
          });
          if (landed) form.reset();
        }}
      >
        <label htmlFor="new-paragraph">New paragraph</label>
        <textarea
          id="new-paragraph"
          name="text"
          disabled={busy}
          required
          rows={3}
          maxLength={50_000}
          placeholder="Add a paragraph at the end"
        />
        <button type="submit" disabled={busy}>
          Add paragraph
        </button>
      </form>
    </section>
  );
}

function DocumentUnavailable() {
  return (
    <p role="alert" className="error">
      Could not load this document. Check the URL or reload to try again.
    </p>
  );
}
