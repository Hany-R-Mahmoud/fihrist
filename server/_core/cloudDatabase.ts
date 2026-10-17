import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../../drizzle/neonSchema";

/** Only invoked by the explicit Neon runtime. Nothing falls back to SQLite. */
let instance: ReturnType<typeof drizzle<typeof schema>> | undefined;
export function openCloudDatabase() {
  const connection = process.env.DATABASE_URL;
  if (!connection || !connection.startsWith("postgresql://")) {
    throw new Error("Fihrist cloud database is not configured. Refusing local fallback.");
  }
  if (!instance) {
    const sql = neon(connection, { fullResults: false });
    instance = drizzle(sql, { schema });
  }
  return instance;
}
