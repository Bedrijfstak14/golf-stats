// Handmatig migreren (ontwikkeling): DATABASE_URL=... npm run db:migrate
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const client = postgres(process.env.DATABASE_URL ?? "postgres://golf:golf@localhost:5439/golf", { max: 1 });
await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
await client.end();
console.log("Migraties uitgevoerd");
