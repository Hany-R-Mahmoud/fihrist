import { ForbiddenError } from "../../shared/_core/errors.js";
import type { InsertUser, User } from "../../drizzle/schema.js";
import * as db from "../db.js";

const LOCAL_USER = {
  openId: "local-user",
  name: "Local User",
  email: "local@localhost",
  loginMethod: "local",
  role: "admin",
} as const satisfies InsertUser;

export async function authenticateLocalUser(): Promise<User> {
  await db.upsertUser({ ...LOCAL_USER, lastSignedIn: new Date() });
  const user = await db.getUserByOpenId(LOCAL_USER.openId);
  if (!user) {
    throw ForbiddenError("Local database is unavailable");
  }
  return user;
}
