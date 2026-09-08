import { HttpApi } from "effect/unstable/httpapi";

import { DocumentsGroup } from "./documents.ts";
import { FilesGroup } from "./files.ts";
import { DecksGroup } from "./slides.ts";

/** Every group behind one origin. The Worker serves it by calling the objects' methods. */
export class Api extends HttpApi.make("Api")
  .add(FilesGroup)
  .add(DocumentsGroup)
  .add(DecksGroup)
  .prefix("/api") {}
