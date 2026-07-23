import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle/sqlite",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.FIHRIST_DB_PATH || "./drizzle/sqlite/fihrist.sqlite",
  },
});
