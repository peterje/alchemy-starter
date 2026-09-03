import { useAtom, useAtomSuspense } from "@effect/atom-react";
import { createFileRoute } from "@tanstack/react-router";
import { AsyncResult } from "effect/unstable/reactivity";
import { Suspense } from "react";
import {
  createTodoAtom,
  removeTodoAtom,
  todoReactivityKeys,
  todosAtom,
  updateTodoAtom,
} from "../todos/atoms.ts";
import { TodoCreate, TodoUpdate } from "../todos/api.ts";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <main className="demo-app">
      <p className="eyebrow">Alchemy + Effect starter</p>
      <h1>Effect all the way down.</h1>
      <p className="lede">
        A schema-first Effect API persists todos in Cloudflare D1. AtomHttpApi drives every client
        query and mutation without React local state.
      </p>
      <Suspense fallback={<p className="status">Loading todos…</p>}>
        <TodoManager />
      </Suspense>
    </main>
  );
}

function TodoManager() {
  const todosResult = useAtomSuspense(todosAtom, { includeFailure: true });
  const [createResult, createTodo] = useAtom(createTodoAtom);
  const [updateResult, updateTodo] = useAtom(updateTodoAtom);
  const [removeResult, removeTodo] = useAtom(removeTodoAtom);

  if (AsyncResult.isFailure(todosResult)) {
    return <p className="status error">Could not load todos.</p>;
  }

  const isMutating =
    AsyncResult.isWaiting(createResult) ||
    AsyncResult.isWaiting(updateResult) ||
    AsyncResult.isWaiting(removeResult);
  const mutationFailed =
    AsyncResult.isFailure(createResult) ||
    AsyncResult.isFailure(updateResult) ||
    AsyncResult.isFailure(removeResult);

  return (
    <section aria-labelledby="todos-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">End-to-end state</p>
          <h2 id="todos-heading">Todos</h2>
        </div>
        <span className="count" aria-live="polite">
          {todosResult.value.length} total
        </span>
      </div>

      <form
        className="todo-form"
        action={(formData) => {
          const title = String(formData.get("title") ?? "").trim();
          if (title.length === 0) return;
          createTodo({
            payload: new TodoCreate({ title }),
            reactivityKeys: todoReactivityKeys,
          });
        }}
      >
        <label htmlFor="todo-title">Add a todo</label>
        <div className="todo-input-row">
          <input
            id="todo-title"
            name="title"
            maxLength={80}
            placeholder="Ship an Effect-native feature"
            required
          />
          <button className="primary" type="submit" disabled={isMutating}>
            {AsyncResult.isWaiting(createResult) ? "Adding…" : "Add"}
          </button>
        </div>
      </form>

      {mutationFailed ? (
        <p className="status error" role="alert">
          The last change failed. Try again.
        </p>
      ) : null}

      {todosResult.value.length === 0 ? (
        <p className="empty">Nothing here yet. Add the first todo.</p>
      ) : (
        <ul className="todo-list">
          {todosResult.value.map((todo) => (
            <li key={todo.id} className="todo-item">
              <button
                type="button"
                className="toggle"
                aria-label={
                  todo.completed ? `Mark ${todo.title} incomplete` : `Complete ${todo.title}`
                }
                aria-pressed={todo.completed}
                disabled={isMutating}
                onClick={() =>
                  updateTodo({
                    params: { id: todo.id },
                    payload: new TodoUpdate({
                      title: todo.title,
                      completed: !todo.completed,
                    }),
                    reactivityKeys: todoReactivityKeys,
                  })
                }
              >
                {todo.completed ? "✓" : ""}
              </button>
              <span className={todo.completed ? "todo-title completed" : "todo-title"}>
                {todo.title}
              </span>
              <button
                type="button"
                className="delete"
                disabled={isMutating}
                onClick={() =>
                  removeTodo({
                    params: { id: todo.id },
                    reactivityKeys: todoReactivityKeys,
                  })
                }
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
