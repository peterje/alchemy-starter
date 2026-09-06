import { Schema } from "effect";
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";

export const UserId = Schema.String.check(Schema.isPattern(/^[a-zA-Z0-9_-]{1,128}$/)).pipe(
  Schema.brand("UserId"),
);
export type UserId = typeof UserId.Type;

export const NoteId = Schema.String.check(Schema.isUUID()).pipe(Schema.brand("NoteId"));
export type NoteId = typeof NoteId.Type;

export const NoteInput = Schema.Struct({
  title: Schema.Trim.check(Schema.isNonEmpty(), Schema.isMaxLength(120)),
  body: Schema.String.check(Schema.isMaxLength(20_000)),
});
export type NoteInput = typeof NoteInput.Type;

export const Note = Schema.Struct({
  id: NoteId,
  ...NoteInput.fields,
  createdAt: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  updatedAt: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
});
export type Note = typeof Note.Type;

export class NoteNotFound extends Schema.TaggedError<NoteNotFound>()(
  "NoteNotFound",
  { id: NoteId },
  { httpApiStatus: 404 },
) {}

/** Internal details are logged at the storage boundary, not sent to clients. */
export class NoteStorageError extends Schema.TaggedError<NoteStorageError>()(
  "NoteStorageError",
  {},
  { httpApiStatus: 500 },
) {}

/** Demo user routing, not authorization. Authenticate before choosing a user's object. */
export class NotesApiGroup extends HttpApiGroup.make("notes")
  .add(
    HttpApiEndpoint.get("list", "/", {
      params: { userId: UserId },
      success: Schema.Array(Note),
      error: NoteStorageError,
    }),
    HttpApiEndpoint.get("get", "/:id", {
      params: { userId: UserId, id: NoteId },
      success: Note,
      error: [NoteNotFound, NoteStorageError],
    }),
    HttpApiEndpoint.post("create", "/", {
      params: { userId: UserId },
      payload: NoteInput,
      success: Note,
      error: NoteStorageError,
    }),
    HttpApiEndpoint.put("update", "/:id", {
      params: { userId: UserId, id: NoteId },
      payload: NoteInput,
      success: Note,
      error: [NoteNotFound, NoteStorageError],
    }),
    HttpApiEndpoint.delete("remove", "/:id", {
      params: { userId: UserId, id: NoteId },
      success: Note,
      error: [NoteNotFound, NoteStorageError],
    }),
  )
  .prefix("/users/:userId/notes") {}

/** The same contract is served inside every user-owned SQLite database. */
export class NotesApi extends HttpApi.make("NotesApi").add(NotesApiGroup).prefix("/api") {}
