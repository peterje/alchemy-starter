import { HttpApi } from "effect/http-api";

import { DocumentsGroup } from "./documents.ts";
import { FilesGroup } from "./files.ts";
import { DecksGroup } from "./slides.ts";
import { AuthGroup, SessionsGroup, UsersGroup } from "./user.ts";

/** Every group behind one origin. The Worker serves users from Postgres and files from their objects. */
export class Api extends HttpApi.make("Api")
  .add(AuthGroup)
  .add(UsersGroup)
  .add(SessionsGroup)
  .add(FilesGroup)
  .add(DocumentsGroup)
  .add(DecksGroup)
  .prefix("/api") {}
