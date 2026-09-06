import { useAtom, useAtomSuspense, useAtomValue } from "@effect/atom-react";
import { createFileRoute, useHydrated } from "@tanstack/react-router";
import { Exit, Schema } from "effect";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import { Suspense } from "react";
import { client, userAtom } from "../atoms.ts";
import { type Note, NoteInput, noteListLimit } from "../notes.ts";
import type { UserId } from "../store.ts";

export const Route = createFileRoute("/")({ component: NotesPage });

const notesAtom = Atom.family((userId: UserId) =>
  client.query("notes", "list", {
    params: { userId },
    reactivityKeys: [userId],
    serializationKey: userId,
  }),
);
const createAtom = client.mutation("notes", "create");
const updateAtom = client.mutation("notes", "update");
const removeAtom = client.mutation("notes", "remove");

function NotesPage() {
  return (
    <Suspense fallback={<p role="status">Loading notes…</p>}>
      <Notes />
    </Suspense>
  );
}

function Notes() {
  const hydrated = useHydrated();
  const userId = useAtomValue(userAtom);
  const notes = useAtomSuspense(notesAtom(userId), { includeFailure: true });
  const [created, create] = useAtom(createAtom, { mode: "promiseExit" });
  const [updated, update] = useAtom(updateAtom, { mode: "promiseExit" });
  const [removed, remove] = useAtom(removeAtom);
  // SSR renders the forms before React can handle submissions. Wait for hydration before enabling them.
  const busy = !hydrated || [created, updated, removed].some(AsyncResult.isWaiting);
  const failed = [created, updated, removed].some(AsyncResult.isFailure);

  return (
    <section key={userId} aria-label={`${userId}'s notes`}>
      <NoteForm
        busy={busy}
        submitLabel={AsyncResult.isWaiting(created) ? "Saving…" : "Add note"}
        onSubmit={(payload) => create({ params: { userId }, payload, reactivityKeys: [userId] })}
      />
      {failed ? (
        <p role="alert" className="error">
          Could not save your change. Your draft is still here — try again.
        </p>
      ) : null}
      {AsyncResult.isFailure(notes) ? (
        <p role="alert" className="error">
          Could not load notes. Reload to try again.
        </p>
      ) : null}
      {AsyncResult.isSuccess(notes) ? (
        <>
          <p className="hint" aria-live="polite">
            {notes.value.length} notes · showing the latest {noteListLimit}
          </p>
          {notes.value.length === 0 ? (
            <p className="empty">No notes yet. Add your first one.</p>
          ) : null}
          <ul>
            {notes.value.map((note) => (
              <li key={note.id}>
                <article aria-label={note.title}>
                  <h2>{note.title}</h2>
                  <p className="note-body">{note.body}</p>
                  <details>
                    <summary>Edit note</summary>
                    <NoteForm
                      note={note}
                      busy={busy}
                      submitLabel="Save changes"
                      onSubmit={(payload) =>
                        update({
                          params: { userId, id: note.id },
                          payload,
                          reactivityKeys: [userId],
                        })
                      }
                    />
                  </details>
                  <button
                    className="delete"
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      remove({ params: { userId, id: note.id }, reactivityKeys: [userId] })
                    }
                  >
                    Delete
                  </button>
                </article>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

function NoteForm({
  note,
  busy,
  submitLabel,
  onSubmit,
}: Readonly<{
  note?: Note;
  busy: boolean;
  submitLabel: string;
  onSubmit: (input: NoteInput) => Promise<Exit.Exit<Note, Error>>;
}>) {
  const id = note?.id ?? "new";
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        // The inputs' constraint attributes mirror NoteInput, so a decode failure is a bug, not user error.
        const input = Schema.decodeUnknownSync(NoteInput)(Object.fromEntries(new FormData(form)));
        if (Exit.isSuccess(await onSubmit(input))) {
          form.reset();
          form.closest("details")?.removeAttribute("open");
        }
      }}
    >
      <label htmlFor={`title-${id}`}>Title</label>
      <input
        id={`title-${id}`}
        name="title"
        disabled={busy}
        defaultValue={note?.title}
        required
        pattern=".*\S.*"
        maxLength={120}
        placeholder="Something worth remembering"
      />
      <label htmlFor={`body-${id}`}>Note</label>
      <textarea
        id={`body-${id}`}
        name="body"
        disabled={busy}
        defaultValue={note?.body}
        maxLength={20_000}
        rows={4}
        placeholder="Write a note…"
      />
      <button type="submit" disabled={busy}>
        {submitLabel}
      </button>
    </form>
  );
}
