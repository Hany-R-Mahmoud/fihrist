import { sql, type SQL } from "drizzle-orm";
import { randomUUID } from "node:crypto";

const cloud = () => process.env.FIHRIST_MODE === "cloud";
function table() {
  return sql.raw(cloud() ? "fihrist.library_records" : "library_records");
}
export async function librarySql(
  statement: SQL
): Promise<Record<string, unknown>[]> {
  if (cloud()) {
    const result = await (await import("./cloudDb.js"))
      .getDb()
      .then(db => db.execute(statement));
    return Array.isArray(result) ? result : result.rows;
  }
  return (await (await import("./db.js")).getDb()).all<Record<string, unknown>>(
    statement
  );
}
/** Both adapters commit every statement together or roll the whole action back. */
export async function libraryBatch(statements: SQL[]) {
  if (!statements.length) return;
  if (cloud()) {
    const db = await (await import("./cloudDb.js")).getDb();
    const queries = statements.map(statement => db.execute(statement));
    await db.batch([queries[0], ...queries.slice(1)]);
  } else {
    const db = await (await import("./db.js")).getDb();
    db.transaction(tx => {
      for (const statement of statements) tx.run(statement);
    });
  }
}
export async function listLibraryRecords(owner: number | string, kind: string) {
  const rows = await librarySql(
    sql`select id,name,payload from ${table()} where owner=${String(owner)} and kind=${kind} order by name,id`
  );
  return rows.map(row => ({
    id: String(row.id),
    name: String(row.name),
    payload: JSON.parse(String(row.payload)) as Record<string, unknown>,
  }));
}
export async function saveLibraryRecord(
  owner: number | string,
  kind: string,
  name: string,
  payload: Record<string, unknown>,
  id: string = randomUUID()
) {
  const result = await librarySql(
    sql`insert into ${table()}(id,owner,kind,name,payload) values(${id},${String(owner)},${kind},${name},${JSON.stringify(payload)}) on conflict(id) do update set name=excluded.name,payload=excluded.payload where ${table()}.owner=${String(owner)} and ${table()}.kind=${kind} returning id`
  );
  if (!result.length) throw new Error("Record not found");
  return id;
}
export async function removeLibraryRecord(
  owner: number | string,
  kind: string,
  id: string
) {
  await librarySql(
    sql`delete from ${table()} where owner=${String(owner)} and kind=${kind} and id=${id} returning id`
  );
}
export async function blockedTagNames(owner: number | string) {
  return new Set(
    (await listLibraryRecords(owner, "blocked-tag")).map(row => row.name)
  );
}
