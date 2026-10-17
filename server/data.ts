import * as sqlite from "./db.js";
import * as neon from "./cloudDb.js";

/** There is deliberately NO implicit cloud -> SQLite fallback. */
export const db = (process.env.FIHRIST_MODE === "cloud" ? neon : sqlite) as unknown as typeof sqlite;
