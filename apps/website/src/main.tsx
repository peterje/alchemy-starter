import { RegistryProvider, useAtom, useAtomValue } from "@effect/atom-react";
import { Exit, Result, Schema } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { AsyncResult, Atom, AtomHttpApi } from "effect/unstable/reactivity";
import { createRoot } from "react-dom/client";
import { NoteInput, NotesApi, UserId } from "./notes.ts";
import "./styles.css";

const client = AtomHttpApi.Service()("NotesClient", {
  api: NotesApi,
  httpClient: FetchHttpClient.layer,
});
const userAtom = Atom.make(UserId.make("alice"));
const notesAtom = Atom.family((userId: UserId) =>
  client.query("notes", "list", {
    params: { userId },
    reactivityKeys: [userId],
  }),
);
const createAtom = client.mutation("notes", "create");
const updateAtom = client.mutation("notes", "update");
const removeAtom = client.mutation("notes", "remove");
const validationAtom = Atom.make("");

function NotesDemo() {
  const [userId, selectUser] = useAtom(userAtom);
  const notes = useAtomValue(notesAtom(userId));
  const [created, create] = useAtom(createAtom, { mode: "promiseExit" });
  const [updated, update] = useAtom(updateAtom, { mode: "promiseExit" });
  const [removed, remove] = useAtom(removeAtom);
  const [validation, setValidation] = useAtom(validationAtom);
  const busy = [created, updated, removed].some(AsyncResult.isWaiting);
  const failed = [created, updated, removed].some(AsyncResult.isFailure);

  return (
    <>
      <header>
        <p className="eyebrow">Alchemy + Effect</p>
        <h1>Your notes, your object.</h1>
        <p>One Durable Object and SQLite database per user. No ORM.</p>
      </header>
      <label className="user-picker">
        Demo user
        <select
          value={userId}
          disabled={busy}
          onChange={(event) => {
            selectUser(UserId.make(event.currentTarget.value));
            setValidation("");
          }}
        >
          <option value="alice">Alice</option>
          <option value="bob">Bob</option>
        </select>
      </label>
      <p className="hint">
        Public demo — switching users is not authentication. Don’t store private notes.
      </p>

      <section key={userId} aria-label={`${userId}'s notes`}>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const input = Schema.decodeUnknownResult(NoteInput)(
              Object.fromEntries(new FormData(form)),
            );
            if (Result.isFailure(input)) {
              setValidation(
                "Enter a title (1–120 characters) and a body of at most 20,000 characters.",
              );
              return;
            }
            setValidation("");
            const result = await create({
              params: { userId },
              payload: input.success,
              reactivityKeys: [userId],
            });
            if (Exit.isSuccess(result)) form.reset();
          }}
        >
          <label htmlFor="title">Title</label>
          <input
            id="title"
            disabled={busy}
            name="title"
            maxLength={120}
            required
            placeholder="Something worth remembering"
          />
          <label htmlFor="body">Note</label>
          <textarea
            id="body"
            disabled={busy}
            name="body"
            maxLength={20_000}
            rows={4}
            placeholder="Write a note…"
          />
          <button type="submit" disabled={busy}>
            {AsyncResult.isWaiting(created) ? "Saving…" : "Add note"}
          </button>
        </form>
        {validation || failed ? (
          <p role="alert" className="error">
            {validation || "Could not save your change. Your draft is still here — try again."}
          </p>
        ) : null}
        {AsyncResult.isFailure(notes) ? (
          <p role="alert" className="error">
            Could not load notes. Reload to try again.
          </p>
        ) : null}
        {!AsyncResult.isSuccess(notes) && !AsyncResult.isFailure(notes) ? (
          <p role="status">Loading notes…</p>
        ) : null}
        {AsyncResult.isSuccess(notes) ? (
          <>
            <p className="hint" aria-live="polite">
              {notes.value.length} notes · showing the latest 100
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
                      <form
                        onSubmit={async (event) => {
                          event.preventDefault();
                          const form = event.currentTarget;
                          const input = Schema.decodeUnknownResult(NoteInput)(
                            Object.fromEntries(new FormData(form)),
                          );
                          if (Result.isFailure(input)) {
                            setValidation(
                              "Enter a title (1–120 characters) and a body of at most 20,000 characters.",
                            );
                            return;
                          }
                          setValidation("");
                          const result = await update({
                            params: { userId, id: note.id },
                            payload: input.success,
                            reactivityKeys: [userId],
                          });
                          if (Exit.isSuccess(result))
                            form.closest("details")?.removeAttribute("open");
                        }}
                      >
                        <label htmlFor={`title-${note.id}`}>Title</label>
                        <input
                          id={`title-${note.id}`}
                          disabled={busy}
                          name="title"
                          defaultValue={note.title}
                          maxLength={120}
                          required
                        />
                        <label htmlFor={`body-${note.id}`}>Note</label>
                        <textarea
                          id={`body-${note.id}`}
                          disabled={busy}
                          name="body"
                          defaultValue={note.body}
                          maxLength={20_000}
                          rows={4}
                        />
                        <button type="submit" disabled={busy}>
                          Save changes
                        </button>
                      </form>
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
    </>
  );
}

const root = document.getElementById("root");
if (root)
  createRoot(root).render(
    <RegistryProvider>
      <NotesDemo />
    </RegistryProvider>,
  );
