import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import mysql from "mysql2/promise";

const LOCAL_DATABASE_URL =
  "mysql://fihrist:fihrist@127.0.0.1:3306/fihrist";

export function resolveDevDatabase(env: NodeJS.ProcessEnv) {
  if (env.DATABASE_URL) return { bootstrap: false, url: env.DATABASE_URL };
  if (env.NODE_ENV === "production" || env.AUTH_MODE === "oauth") {
    return { bootstrap: false, url: "" };
  }
  return { bootstrap: true, url: LOCAL_DATABASE_URL };
}

function run(command: string, args: string[], env = process.env) {
  return new Promise<void>((resolveRun, reject) => {
    const child = spawn(command, args, { env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", code => {
      if (code === 0) resolveRun();
      else reject(new Error(`${command} exited with code ${code ?? "unknown"}`));
    });
  });
}

function commandSucceeds(command: string, args: string[]) {
  return new Promise<boolean>(resolveCheck => {
    const child = spawn(command, args, { stdio: "ignore" });
    child.once("error", () => resolveCheck(false));
    child.once("exit", code => resolveCheck(code === 0));
  });
}

async function ensureDocker() {
  if (await commandSucceeds("docker", ["info"])) return;
  if (process.platform === "darwin") {
    console.log("[Local] Starting Docker Desktop…");
    await run("docker", ["desktop", "start"]);
    if (await commandSucceeds("docker", ["info"])) return;
  }
  throw new Error(
    "Docker is required for Fihrist local mode. Start Docker, then run pnpm dev again."
  );
}

async function waitForDatabase(url: string) {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const connection = await mysql.createConnection(url);
      await connection.ping();
      await connection.end();
      return;
    } catch {
      await new Promise(resolveWait => setTimeout(resolveWait, 1_000));
    }
  }
  throw new Error("The Fihrist local database did not become ready in 60 seconds.");
}

async function startApplication(env: NodeJS.ProcessEnv) {
  await new Promise<void>((resolveApp, reject) => {
    const child = spawn(
      "pnpm",
      ["exec", "tsx", "watch", "server/_core/index.ts"],
      { env, stdio: "inherit" }
    );
    const forward = (signal: NodeJS.Signals) => child.kill(signal);
    process.once("SIGINT", forward);
    process.once("SIGTERM", forward);
    child.once("error", reject);
    child.once("exit", code => {
      process.off("SIGINT", forward);
      process.off("SIGTERM", forward);
      if (code === 0 || code === null) resolveApp();
      else reject(new Error(`Fihrist exited with code ${code}`));
    });
  });
}

export async function main() {
  const nodeEnv = process.env.NODE_ENV || "development";
  const database = resolveDevDatabase({ ...process.env, NODE_ENV: nodeEnv });
  const env = {
    ...process.env,
    NODE_ENV: nodeEnv,
    ...(database.url ? { DATABASE_URL: database.url } : {}),
  };

  if (database.bootstrap) {
    await ensureDocker();
    console.log("[Local] Starting Fihrist database…");
    await run("docker", ["compose", "up", "-d", "database"], env);
    await waitForDatabase(database.url);
    await run("pnpm", ["exec", "drizzle-kit", "migrate"], env);
  }

  await startApplication(env);
}

const isEntryPoint =
  process.argv[1] &&
  resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);

if (isEntryPoint) {
  void main().catch(error => {
    console.error("[Local]", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
