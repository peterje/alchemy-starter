import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";

import { UserId } from "./user.ts";

const Timestamp = Schema.Natural;

export const ChatId = Schema.String.check(Schema.isUUID()).pipe(Schema.brand("ChatId"));
export type ChatId = typeof ChatId.Type;

export const MessageId = Schema.String.check(Schema.isUUID()).pipe(Schema.brand("MessageId"));
export type MessageId = typeof MessageId.Type;

export const ChatInput = Schema.Struct({
  title: Schema.Trim.check(Schema.isNonEmpty(), Schema.isMaxLength(80)),
});
export type ChatInput = typeof ChatInput.Type;

/** A user's own record of a chat they belong to. The chat's object stays authoritative. */
export const Membership = Schema.Struct({
  chatId: ChatId,
  ...ChatInput.fields,
  joinedAt: Timestamp,
});
export type Membership = typeof Membership.Type;

export const Chat = Schema.Struct({
  id: ChatId,
  ...ChatInput.fields,
  createdAt: Timestamp,
  members: Schema.Array(UserId),
});
export type Chat = typeof Chat.Type;

/** Demo only: the client names the author. Take it from the session in a real app. */
export const MessageInput = Schema.Struct({
  author: UserId,
  body: Schema.Trim.check(Schema.isNonEmpty(), Schema.isMaxLength(2_000)),
});
export type MessageInput = typeof MessageInput.Type;

export const Message = Schema.Struct({
  id: MessageId,
  ...MessageInput.fields,
  createdAt: Timestamp,
});
export type Message = typeof Message.Type;

export class ChatNotFound extends Schema.TaggedError<ChatNotFound>()(
  "ChatNotFound",
  { id: ChatId },
  { httpApiStatus: 404 },
) {}

export class NotAMember extends Schema.TaggedError<NotAMember>()(
  "NotAMember",
  { chatId: ChatId, userId: UserId },
  { httpApiStatus: 403 },
) {}

/** Keep the demo response bounded; introduce pagination for longer histories. */
export const messageListLimit = 100;

/** Served by the user's object: the chats a user belongs to. */
export class MembershipsGroup extends HttpApiGroup.make("memberships")
  .add(
    HttpApiEndpoint.get("list", "/", {
      params: { userId: UserId },
      success: Schema.Array(Membership),
    }),
    HttpApiEndpoint.post("create", "/", {
      params: { userId: UserId },
      payload: ChatInput,
      success: Membership,
    }),
    HttpApiEndpoint.post("join", "/:chatId", {
      params: { userId: UserId, chatId: ChatId },
      success: Membership,
      error: ChatNotFound,
    }),
  )
  .prefix("/users/:userId/chats") {}

/** Served by the chat's object: one chat, its members, and its messages. */
export class ChatGroup extends HttpApiGroup.make("chat")
  .add(
    HttpApiEndpoint.get("get", "/", {
      params: { chatId: ChatId },
      success: Chat,
      error: ChatNotFound,
    }),
    HttpApiEndpoint.get("messages", "/messages", {
      params: { chatId: ChatId },
      success: Schema.Array(Message),
    }),
    HttpApiEndpoint.post("post", "/messages", {
      params: { chatId: ChatId },
      payload: MessageInput,
      success: Message,
      error: NotAMember,
    }),
  )
  .prefix("/chats/:chatId") {}
