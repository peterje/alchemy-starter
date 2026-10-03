import * as Alchemy from "alchemy";

/**
 * The shared database stack's contract: every stage branches from this database. Kept apart
 * from `stacks/database.ts`, which deploys it, so the Worker bundle never pulls in providers.
 */
export class Database extends Alchemy.Stack<Database, { name: string }>()("StarterDatabase") {}

/**
 * Where the database runs, and the Workers placement hint for the same AWS region. Workers placed
 * beside it make each query a short hop instead of a trip from wherever the request arrived.
 * Choose before the database exists: PlanetScale fixes a database's region when it is created.
 */
export const region = { planetscale: "us-east", workers: "aws:us-east-1" } as const;
