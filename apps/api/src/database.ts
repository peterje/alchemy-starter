import * as Alchemy from "alchemy";

/**
 * The shared database stack's contract: every stage branches from this database. Kept apart
 * from `stacks/database.ts`, which deploys it, so the Worker bundle never pulls in providers.
 */
export class Database extends Alchemy.Stack<Database, { name: string }>()("StarterDatabase") {}
