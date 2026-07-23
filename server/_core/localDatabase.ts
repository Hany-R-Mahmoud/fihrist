import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

export function localDataDirectory(env: NodeJS.ProcessEnv = process.env) {
  if (env.FIHRIST_DATA_DIR) return resolve(env.FIHRIST_DATA_DIR);
  const base = platform() === "darwin"
    ? join(homedir(), "Library", "Application Support")
    : platform() === "win32"
      ? env.APPDATA || join(homedir(), "AppData", "Roaming")
      : env.XDG_DATA_HOME || join(homedir(), ".local", "share");
  return join(base, "Fihrist");
}

export function localDatabasePath(env: NodeJS.ProcessEnv = process.env) {
  return join(localDataDirectory(env), "fihrist.sqlite");
}

export function openLocalDatabase(env: NodeJS.ProcessEnv = process.env) {
  const path = localDatabasePath(env);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const client = new Database(path);
  client.pragma("journal_mode = WAL");
  client.pragma("foreign_keys = ON");
  client.pragma("busy_timeout = 5000");
  client.pragma("synchronous = NORMAL");
  const database = drizzle(client);
  migrate(database, { migrationsFolder: resolve(process.cwd(), "drizzle/sqlite") });
  client.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS bookmarks_fts USING fts5(
      title, description, notes, contentText, host,
      content='bookmarks', content_rowid='id', tokenize='unicode61'
    );
    CREATE TRIGGER IF NOT EXISTS bookmarks_fts_insert AFTER INSERT ON bookmarks BEGIN
      INSERT INTO bookmarks_fts(rowid, title, description, notes, contentText, host)
      VALUES (new.id, new.title, new.description, new.notes, new.contentText, new.host);
    END;
    CREATE TRIGGER IF NOT EXISTS bookmarks_fts_update AFTER UPDATE OF title, description, notes, contentText, host ON bookmarks BEGIN
      INSERT INTO bookmarks_fts(bookmarks_fts, rowid, title, description, notes, contentText, host)
      VALUES ('delete', old.id, old.title, old.description, old.notes, old.contentText, old.host);
      INSERT INTO bookmarks_fts(rowid, title, description, notes, contentText, host)
      VALUES (new.id, new.title, new.description, new.notes, new.contentText, new.host);
    END;
    CREATE TRIGGER IF NOT EXISTS bookmarks_fts_delete AFTER DELETE ON bookmarks BEGIN
      INSERT INTO bookmarks_fts(bookmarks_fts, rowid, title, description, notes, contentText, host)
      VALUES ('delete', old.id, old.title, old.description, old.notes, old.contentText, old.host);
    END;
  `);
  client.prepare("INSERT INTO bookmarks_fts(bookmarks_fts) VALUES ('rebuild')").run();
  return database;
}

export async function backupLocalDatabase(
  database: ReturnType<typeof openLocalDatabase>,
  destination: string
) {
  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
  await database.$client.backup(destination);
}
