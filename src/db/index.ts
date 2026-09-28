import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pg?: ReturnType<typeof postgres> };

const client =
  globalForDb.pg ??
  postgres(process.env.DATABASE_URL ?? "postgres://golf:golf@localhost:5439/golf", {
    max: 10,
    // numeric als string laten; omzetten gebeurt expliciet via num()
  });
if (process.env.NODE_ENV !== "production") globalForDb.pg = client;

export const db = drizzle(client, { schema });
export { schema };

/** numeric-kolommen komen als string terug */
export const num = (v: string | number | null | undefined): number | null =>
  v == null || v === "" ? null : Number(v);
