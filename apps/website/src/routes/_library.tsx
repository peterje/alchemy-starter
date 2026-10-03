import { createFileRoute, Outlet } from "@tanstack/react-router";

import "@/library.css";

/** The document and deck library, laid out as a page of its own inside the app. */
export const Route = createFileRoute("/_library")({ component: LibraryLayout });

function LibraryLayout() {
  return (
    <div className="library flex-1 overflow-y-auto">
      <main>
        <h1>Every document and deck is an object.</h1>
        <p>
          Each file is a Durable Object with its own SQLite database and a single writer. Each
          user's object indexes the files they created. No ORM.
        </p>
        <Outlet />
      </main>
    </div>
  );
}
