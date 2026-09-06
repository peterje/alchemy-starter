import { HttpApi } from "effect/unstable/httpapi";
import { NotesGroup } from "./notes.ts";

/** Every group is served from the user's Durable Object; add new feature groups here. */
export class Api extends HttpApi.make("Api").add(NotesGroup).prefix("/api") {}
