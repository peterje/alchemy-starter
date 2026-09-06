import { useAtom, useAtomSuspense, useAtomValue } from "@effect/atom-react";
import { Link, createFileRoute, useHydrated, useNavigate } from "@tanstack/react-router";
import { Exit, Schema } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { Suspense } from "react";
import { client, userAtom } from "../atoms.ts";
import { ChatInput } from "../chats.ts";
import type { UserId } from "../user.ts";

export const Route = createFileRoute("/")({ component: MembershipsPage });

const membershipsAtom = (userId: UserId) =>
  client.query("memberships", "list", {
    params: { userId },
    reactivityKeys: { memberships: [userId] },
  });
const createAtom = client.mutation("memberships", "create");

function MembershipsPage() {
  return (
    <Suspense fallback={<p role="status">Loading chats…</p>}>
      <Memberships />
    </Suspense>
  );
}

function Memberships() {
  const hydrated = useHydrated();
  const navigate = useNavigate();
  const userId = useAtomValue(userAtom);
  const memberships = useAtomSuspense(membershipsAtom(userId), { includeFailure: true });
  const [created, create] = useAtom(createAtom, { mode: "promiseExit" });
  // SSR renders the form before React can handle submissions. Wait for hydration before enabling it.
  const busy = !hydrated || AsyncResult.isWaiting(created);

  return (
    <section key={userId} aria-label={`${userId}'s chats`}>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          // The input's constraint attributes mirror ChatInput, so a decode failure is a bug, not user error.
          const payload = Schema.decodeUnknownSync(ChatInput)(
            Object.fromEntries(new FormData(event.currentTarget)),
          );
          const result = await create({
            params: { userId },
            payload,
            reactivityKeys: { memberships: [userId] },
          });
          if (Exit.isSuccess(result)) {
            await navigate({ to: "/chats/$chatId", params: { chatId: result.value.chatId } });
          }
        }}
      >
        <label htmlFor="title">New chat</label>
        <input
          id="title"
          name="title"
          disabled={busy}
          required
          pattern=".*\S.*"
          maxLength={80}
          placeholder="Standup"
        />
        <button type="submit" disabled={busy}>
          {AsyncResult.isWaiting(created) ? "Creating…" : "Create chat"}
        </button>
      </form>
      {AsyncResult.isFailure(created) ? (
        <p role="alert" className="error">
          Could not create the chat. Your title is still here — try again.
        </p>
      ) : null}
      {AsyncResult.isFailure(memberships) ? (
        <p role="alert" className="error">
          Could not load your chats. Reload to try again.
        </p>
      ) : (
        <>
          <p className="hint">Open a chat and share its URL to invite the other demo user.</p>
          {memberships.value.length === 0 ? (
            <p className="empty">No chats yet. Create your first one.</p>
          ) : null}
          <ul aria-label="Your chats">
            {memberships.value.map((membership) => (
              <li key={membership.chatId}>
                <Link to="/chats/$chatId" params={{ chatId: membership.chatId }}>
                  {membership.title}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
