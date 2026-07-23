import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { backupLocalDatabase, openLocalDatabase } from "./localDatabase";

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("local SQLite database", () => {
  it("creates the schema, enables FTS, and indexes bookmark inserts", () => {
    const directory = mkdtempSync(join(tmpdir(), "fihrist-"));
    tempDirectories.push(directory);
    const database = openLocalDatabase({ FIHRIST_DATA_DIR: directory });
    const client = database.$client;
    const now = Date.now();
    client.prepare("insert into users (openId, name, role, createdAt, updatedAt, lastSignedIn) values (?, ?, ?, ?, ?, ?)").run("local-user", "Local User", "admin", now, now, now);
    client.prepare("insert into bookmarks (userId, url, normalizedUrl, normalizedUrlHash, host, createdAt, updatedAt) values (?, ?, ?, ?, ?, ?, ?)").run(1, "https://example.com", "https://example.com/", "hash", "example.com", now, now);
    const result = client.prepare("select rowid from bookmarks_fts where bookmarks_fts match ?").all("example*");
    expect(result).toHaveLength(1);
    expect(client.pragma("foreign_keys", { simple: true })).toBe(1);
    client.close();
  });

  it("creates a restorable SQLite backup", async () => {
    const directory = mkdtempSync(join(tmpdir(), "fihrist-"));
    tempDirectories.push(directory);
    const database = openLocalDatabase({ FIHRIST_DATA_DIR: directory });
    const client = database.$client;
    const now = Date.now();
    client.prepare("insert into users (openId, name, role, createdAt, updatedAt, lastSignedIn) values (?, ?, ?, ?, ?, ?)").run("backup-user", "Backup User", "user", now, now, now);
    await backupLocalDatabase(database, join(directory, "backup.sqlite"));
    const backup = new Database(join(directory, "backup.sqlite"), { readonly: true });
    const row = backup.prepare("select count(*) as count from users").get();
    expect(row.count).toBe(1);
    backup.close();
    client.close();
  });
});
