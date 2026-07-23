import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const drizzleDirectory = path.resolve(import.meta.dirname, "../drizzle/sqlite");
const journalSchema = z.object({
  entries: z.array(z.object({ tag: z.string().min(1) })),
});

const readJournal = () =>
  journalSchema.parse(
    JSON.parse(readFileSync(path.join(drizzleDirectory, "meta/_journal.json"), "utf8"))
  );

describe("Drizzle migrations", () => {
  it("keeps every journaled migration SQL file", () => {
    // Given: Drizzle's machine-consumed migration journal.
    const journal = readJournal();

    // When: each journal tag is resolved as a migration file.
    const missingFiles = journal.entries
      .map(entry => `${entry.tag}.sql`)
      .filter(file => !existsSync(path.join(drizzleDirectory, file)));

    // Then: a fresh database can load the complete migration chain.
    expect(missingFiles).toEqual([]);
  });

  it("contains no duplicate statements within a migration", () => {
    // Given: every available SQL migration.
    const migrationFiles = readJournal().entries
      .map(entry => `${entry.tag}.sql`)
      .filter(file => existsSync(path.join(drizzleDirectory, file)));

    // When: Drizzle statement boundaries are parsed.
    const duplicateStatements = migrationFiles.flatMap(file => {
      const statements = readFileSync(path.join(drizzleDirectory, file), "utf8")
        .split("--> statement-breakpoint")
        .map(statement => statement.trim())
        .filter(Boolean);
      const seen = new Set<string>();
      return statements
        .filter(statement => (seen.has(statement) ? true : !seen.add(statement)))
        .map(statement => ({ file, statement }));
    });

    // Then: migration execution cannot repeat an identical schema operation.
    expect(duplicateStatements).toEqual([]);
  });
});
