import { useAtom, useAtomSuspense, useAtomValue } from "@effect/atom-react";
import { createFileRoute, useHydrated } from "@tanstack/react-router";
import { Exit, Schema } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { Suspense } from "react";
import { client, userAtom } from "../atoms.ts";
import { ChatId, MessageInput, messageListLimit } from "../chats.ts";

export const Route = createFileRoute("/chats/$chatId")({
  // A malformed ID fails here, and the route renders ChatUnavailable instead of the page.
  params: {
    parse: ({ chatId }) => ({ chatId: Schema.decodeUnknownSync(ChatId)(chatId) }),
    stringify: ({ chatId }) => ({ chatId }),
  },
  errorComponent: ChatUnavailable,
  component: ChatPage,
});

const chatAtom = (chatId: ChatId) =>
  client.query("chat", "get", { params: { chatId }, reactivityKeys: { chat: [chatId] } });
const messagesAtom = (chatId: ChatId) =>
  client.query("chat", "messages", { params: { chatId }, reactivityKeys: { messages: [chatId] } });
const joinAtom = client.mutation("memberships", "join");
const postAtom = client.mutation("chat", "post");

function ChatPage() {
  const { chatId } = Route.useParams();
  return (
    <Suspense fallback={<p role="status">Loading chat…</p>}>
      <Room chatId={chatId} />
    </Suspense>
  );
}

function Room({ chatId }: Readonly<{ chatId: ChatId }>) {
  const hydrated = useHydrated();
  const userId = useAtomValue(userAtom);
  const chat = useAtomSuspense(chatAtom(chatId), { includeFailure: true });
  const messages = useAtomSuspense(messagesAtom(chatId), { includeFailure: true });
  const [joined, join] = useAtom(joinAtom);
  const [posted, post] = useAtom(postAtom, { mode: "promiseExit" });
  const busy = !hydrated || AsyncResult.isWaiting(joined) || AsyncResult.isWaiting(posted);
  const failed = AsyncResult.isFailure(joined) || AsyncResult.isFailure(posted);

  if (AsyncResult.isFailure(chat) || AsyncResult.isFailure(messages)) return <ChatUnavailable />;
  const member = chat.value.members.includes(userId);
  return (
    <section key={`${chatId}/${userId}`} aria-label={chat.value.title}>
      <h2>{chat.value.title}</h2>
      <p className="hint">
        Members: {chat.value.members.join(", ")} · showing the latest {messageListLimit} messages
      </p>
      {messages.value.length === 0 ? <p className="empty">No messages yet.</p> : null}
      <ol className="messages" aria-label="Messages">
        {messages.value.map((message) => (
          <li key={message.id}>
            <strong>{message.author}</strong> {message.body}
          </li>
        ))}
      </ol>
      {member ? (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            // The input's constraint attributes mirror MessageInput, so a decode failure is a bug, not user error.
            const payload = Schema.decodeUnknownSync(MessageInput)({
              ...Object.fromEntries(new FormData(form)),
              author: userId,
            });
            const result = await post({
              params: { chatId },
              payload,
              reactivityKeys: { messages: [chatId] },
            });
            if (Exit.isSuccess(result)) form.reset();
          }}
        >
          <label htmlFor="body">Message</label>
          <input
            id="body"
            name="body"
            disabled={busy}
            required
            pattern=".*\S.*"
            maxLength={2_000}
            placeholder={`Say something as ${userId}`}
          />
          <button type="submit" disabled={busy}>
            {AsyncResult.isWaiting(posted) ? "Sending…" : "Send"}
          </button>
        </form>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            join({
              params: { userId, chatId },
              reactivityKeys: { memberships: [userId], chat: [chatId] },
            })
          }
        >
          Join as {userId}
        </button>
      )}
      {failed ? (
        <p role="alert" className="error">
          Could not save your change. Your draft is still here — try again.
        </p>
      ) : null}
    </section>
  );
}

function ChatUnavailable() {
  return (
    <p role="alert" className="error">
      Could not load this chat. Check the URL or reload to try again.
    </p>
  );
}
