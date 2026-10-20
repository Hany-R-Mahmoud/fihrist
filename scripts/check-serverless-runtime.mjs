import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import ts from "typescript";

// Execute unbundled emitted ESM in plain Node, without tsx/Vite alias resolution.
// This catches the failure that a web build and TypeScript's bundler mode miss.
const cache = resolve("node_modules/.cache");
await mkdir(cache, { recursive: true });
const output = await mkdtemp(join(cache, "fihrist-runtime-"));
async function emit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const source = join(directory, entry.name);
    if (entry.isDirectory()) { await emit(source); continue; }
    if (!source.endsWith(".ts") || /\.(test|spec|d)\.ts$/.test(source)) continue;
    const target = join(output, source.replace(/\.ts$/, ".js"));
    await mkdir(dirname(target), { recursive: true });
    const result = ts.transpileModule(await readFile(source, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    });
    await writeFile(target, result.outputText);
  }
}
try {
  for (const directory of ["api", "server", "drizzle", "shared"]) await emit(directory);
  await writeFile(join(output, "package.json"), JSON.stringify({ type: "module" }));
  const probe = `
    import assert from 'node:assert/strict';
    import health from './api/health.js';
    import trpc from './api/trpc/[trpc].js';
    import cron from './api/cron/jobs.js';
    const request = path => new Request('https://runtime.test' + path);
    const healthResponse = await health.fetch(request('/api/health'));
    assert.equal(healthResponse.status, 503);
    assert.deepEqual(await healthResponse.json(), {status:'database-unavailable'});
    const me = await trpc.fetch(request('/api/trpc/auth.me'));
    assert.equal(me.status, 200);
    assert.equal((await me.json()).result.data.json, null);
    for (const path of ['bookmarks.list', 'collections.list']) {
      const response = await trpc.fetch(request('/api/trpc/' + path));
      assert.equal(response.status, 401, path);
      assert.equal((await response.json()).error.json.data.code, 'UNAUTHORIZED');
    }
    const invalid = await trpc.fetch(new Request('https://runtime.test/api/trpc/bookmarks.list', {headers:{Authorization:'Bearer invalid'}}));
    assert.equal(invalid.status, 401);
    assert.equal((await cron.fetch(request('/api/cron/jobs'))).status, 401);
    console.log('Emitted Node ESM: health executes; auth.me returns null; protected APIs and cron reject missing/invalid credentials.');
  `;
  await writeFile(join(output, "probe.mjs"), probe);
  const result = spawnSync(process.execPath, [join(output, "probe.mjs")], {
    env: { ...process.env, FIHRIST_MODE: "cloud", DATABASE_URL: "", NEON_AUTH_BASE_URL: "", CRON_SECRET: "" },
    encoding: "utf8",
  });
  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  assert.equal(result.status, 0, "Emitted serverless handlers must execute in Node");
} finally {
  await rm(output, { recursive: true, force: true });
}
