import { ForbiddenError } from "@shared/_core/errors";
import type { InsertUser, User } from "../../drizzle/schema";
import * as db from "../db";

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
