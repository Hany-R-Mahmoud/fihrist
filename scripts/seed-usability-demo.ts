// TOKEN_POLICY_BATCHED_EXECUTION: isolated synthetic data for the requested UI evidence.
import { tmpdir } from "node:os";
import { resolve, sep } from "node:path";
import { sql } from "drizzle-orm";
import * as db from "../server/db.js";
import { refreshTopicShelves } from "../server/services/topicShelves.js";
const directory = resolve(process.env.FIHRIST_DATA_DIR ?? ".");
if (
  !directory.startsWith(resolve(tmpdir()) + sep) &&
  !directory.startsWith("/private/tmp/")
)
  throw new Error("Demo data requires an isolated temporary FIHRIST_DATA_DIR");
await db.upsertUser({ openId: "local-user", name: "Usability demo" });
const user = await db.getUserByOpenId("local-user");
if (!user) throw new Error("Demo owner not created");
const collection = await db.createCollection(user.id, "Reading / للقراءة");
for (let i = 1; i <= 24; i++) {
  const url = `https://example.org/fihrist-demo/${i}`;
  const b = await db.createBookmarkWithJob(
    {
      userId: user.id,
      collectionId: i % 3 === 0 ? collection!.id : null,
      url,
      normalizedUrl: url,
      normalizedUrlHash: `demo-${i}`,
      host: "example.org",
    },
    "scrape"
  );
  if (!b) continue;
  await db.updateBookmarkMetadata(user.id, b.id, {
    title: `Reading idea ${i} · فكرة للقراءة`,
    description:
      "A synthetic bookmark for testing the library · رابط تجريبي لاختبار المكتبة",
    ingestionStatus: "ready",
  });
  await db.updateReading(user.id, b.id, {
    readingStatus: i <= 3 ? "reading" : "unread",
    pinned: i === 2,
  });
  await db.updateBookmarkHealth(user.id, b.id, {
    healthStatus: i === 4 ? "broken" : i === 5 ? "needs_review" : "unchecked",
    httpStatus: i === 4 ? 404 : null,
    healthError: null,
    lastCheckedAt: i === 4 || i === 5 ? new Date() : null,
  });
  await db.addManualTag(user.id, b.id, "Reading");
  await db.addManualTag(user.id, b.id, "Ideas");
}
const database = await db.getDb();
database.run(sql`delete from bookmarkJobs`);
await refreshTopicShelves(user.id);
database.$client.close();
console.info("Synthetic library ready");
