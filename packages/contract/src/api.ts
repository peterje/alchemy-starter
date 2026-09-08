import { HttpApi } from "effect/unstable/httpapi";

import { ChatGroup, MembershipsGroup } from "./chats.ts";
import { DocumentsGroup } from "./documents.ts";
import { FilesGroup } from "./files.ts";
import { DecksGroup } from "./slides.ts";

/** Every group behind one origin. The Worker serves it by calling the objects' methods. */
export class Api extends HttpApi.make("Api")
  .add(MembershipsGroup)
  .add(FilesGroup)
  .add(ChatGroup)
  .add(DocumentsGroup)
  .add(DecksGroup)
  .prefix("/api") {}
