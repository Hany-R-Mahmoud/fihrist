import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

function startServer() {
  return new Promise<void>((resolveStart, reject) => {
    const child = spawn("pnpm", ["exec", "tsx", "watch", "server/_core/index.ts"], {
      env: { ...process.env, NODE_ENV: process.env.NODE_ENV || "development", HOST: "127.0.0.1" },
      stdio: "inherit",
    });
    const stop = (signal: NodeJS.Signals) => child.kill(signal);
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    child.once("error", reject);
    child.once("exit", code => {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      if (code === 0 || code === null) resolveStart();
      else reject(new Error(`Fihrist exited with code ${code}`));
    });
  });
}

export async function main() {
  await startServer();
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
