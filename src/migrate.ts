import path from "node:path";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db } from "./db";

/** Voert openstaande SQL-migraties uit bij het opstarten van de server. */
export async function runMigrations() {
  const folder = process.env.MIGRATIONS_DIR ?? path.join(process.cwd(), "drizzle");
  await migrate(db, { migrationsFolder: folder });
  console.log("[golf-stats] database-migraties uitgevoerd");
}
