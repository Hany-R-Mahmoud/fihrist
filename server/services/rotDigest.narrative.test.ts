import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../_core/llm", () => ({
  invokeLLM: vi.fn(),
  listLLMModels: vi.fn(async () => ({
    object: "list",
    data: [{ id: "gpt-5-mini", object: "model", created: 0, owned_by: "test" }],
  })),
}));

const directories: string[] = [];

beforeEach(() => {
  vi.resetModules();
  // The mocked module keeps its spy across resets, so start each test clean.
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

async function openFixture(options: { withKey: boolean }) {
  const directory = mkdtempSync(join(tmpdir(), "fihrist-narrative-"));
  directories.push(directory);
  vi.stubEnv("FIHRIST_DATA_DIR", directory);
  vi.stubEnv("FIHRIST_AI_MODEL", "gpt-5-mini");
  if (options.withKey) {
    // A closed local port: if the mock were ever bypassed the call fails
    // instantly instead of reaching a real host and retrying.
    vi.stubEnv("FIHRIST_AI_BASE_URL", "http://127.0.0.1:9/v1");
    vi.stubEnv("FIHRIST_AI_API_KEY", "test-key");
  } else {
    vi.stubEnv("FIHRIST_AI_BASE_URL", "");
    vi.stubEnv("FIHRIST_AI_API_KEY", "");
  }
  vi.resetModules();
  const db = await import("../db");
  const digest = await import("./rotDigest");
  const llm = await import("../_core/llm");
  await db.upsertUser({
    openId: "local-user",
    name: "Local User",
    email: "local@localhost",
    loginMethod: "local",
    role: "admin",
  });
  return { db, digest, llm };
}

async function seedBrokenBookmark(db: Awaited<ReturnType<typeof openFixture>>["db"]) {
  const created = await db.createBookmark({
    userId: 1,
    collectionId: null,
    url: "https://example.com/gone",
    normalizedUrl: "https://example.com/gone",
    normalizedUrlHash: "hash-gone",
    host: "example.com",
  });
  await db.updateBookmarkMetadata(1, created.id, { title: "Gone page" });
  return created.id;
}

function llmResponse(narrative: string, itemIds: number[]) {
  return {
    id: "resp",
    created: 0,
    model: "gpt-5-mini",
    choices: [
      {
        index: 0,
        message: { role: "assistant" as const, content: JSON.stringify({ narrative, itemIds }) },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 120, completion_tokens: 40, total_tokens: 160 },
  };
}

// Each test opens a real SQLite database and applies every migration, which
// is slower than the default per-test budget allows on a loaded machine.
describe("rot digest narrative — silent cases", () => {
  it("makes no LLM call at all when no key is configured, and ships the facts alone", async () => {
    const { db, digest, llm } = await openFixture({ withKey: false });
    const bookmarkId = await seedBrokenBookmark(db);
    const run = await db.startHealthRun(1, { trigger: "weekly", startedAt: new Date() });
    await db.insertHealthCheck({
      userId: 1,
      bookmarkId,
      runId: run.id,
      jobId: null,
      checkedAt: new Date(),
      status: "broken",
      httpStatus: 404,
      finalUrl: null,
      durationMs: 100,
      error: "The page is gone (HTTP 404).",
    });

    const stored = await digest.generateRotDigest(1, run);

    expect(llm.invokeLLM).not.toHaveBeenCalled();
    expect(stored.narrative).toBeNull();
    expect(stored.narrativeStatus).toBe("none");
    // The facts block is still there — Layer 1 is the product.
    expect(stored.facts).toContain("Gone page");
  });

  it("makes no LLM call when the run has no changes", async () => {
    const { db, digest, llm } = await openFixture({ withKey: true });
    const created = await db.createBookmark({
      userId: 1,
      collectionId: null,
      url: "https://example.com/fine",
      normalizedUrl: "https://example.com/fine",
      normalizedUrlHash: "hash-fine",
      host: "example.com",
    });
    await db.updateBookmarkMetadata(1, created.id, { title: "Fine page" });

    const run = await db.startHealthRun(1, { trigger: "weekly", startedAt: new Date() });
    await db.insertHealthCheck({
      userId: 1,
      bookmarkId: created.id,
      runId: run.id,
      jobId: null,
      checkedAt: new Date(),
      status: "healthy",
      httpStatus: 200,
      finalUrl: null,
      durationMs: 100,
      error: null,
    });

    const stored = await digest.generateRotDigest(1, run);

    expect(llm.invokeLLM).not.toHaveBeenCalled();
    expect(stored.narrative).toBeNull();
    expect(stored.narrativeStatus).toBe("none");
  });

  it("makes exactly one attempt and ships the facts alone when the LLM fails", async () => {
    const { db, digest, llm } = await openFixture({ withKey: true });
    const bookmarkId = await seedBrokenBookmark(db);
    const run = await db.startHealthRun(1, { trigger: "weekly", startedAt: new Date() });
    await db.insertHealthCheck({
      userId: 1,
      bookmarkId,
      runId: run.id,
      jobId: null,
      checkedAt: new Date(),
      status: "broken",
      httpStatus: 404,
      finalUrl: null,
      durationMs: 100,
      error: "The page is gone (HTTP 404).",
    });

    (llm.invokeLLM as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("LLM invoke failed: 500")
    );

    const stored = await digest.generateRotDigest(1, run);

    expect(llm.invokeLLM).toHaveBeenCalledTimes(1);
    expect(stored.narrative).toBeNull();
    expect(stored.narrativeStatus).toBe("failed");
    // The facts block survived the failure.
    expect(stored.facts).toContain("Gone page");
  });

  it("rejects a poisoned narrative and ships the facts alone", async () => {
    const { db, digest, llm } = await openFixture({ withKey: true });
    const bookmarkId = await seedBrokenBookmark(db);
    const run = await db.startHealthRun(1, { trigger: "weekly", startedAt: new Date() });
    await db.insertHealthCheck({
      userId: 1,
      bookmarkId,
      runId: run.id,
      jobId: null,
      checkedAt: new Date(),
      status: "broken",
      httpStatus: 404,
      finalUrl: null,
      durationMs: 100,
      error: "The page is gone (HTTP 404).",
    });

    // The model references a link id that is not in this run.
    (llm.invokeLLM as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      llmResponse("الصفحة اتشالت من الموقع، راجع [[99]].", [99])
    );

    const stored = await digest.generateRotDigest(1, run);

    expect(llm.invokeLLM).toHaveBeenCalledTimes(1);
    expect(stored.narrative).toBeNull();
    expect(stored.narrativeStatus).toBe("failed");
    expect(stored.facts).toContain("Gone page");
  });

  it("stores the narrative, the model and the token counts when the answer is grounded", async () => {
    const { db, digest, llm } = await openFixture({ withKey: true });
    const bookmarkId = await seedBrokenBookmark(db);
    const run = await db.startHealthRun(1, { trigger: "weekly", startedAt: new Date() });
    await db.insertHealthCheck({
      userId: 1,
      bookmarkId,
      runId: run.id,
      jobId: null,
      checkedAt: new Date(),
      status: "broken",
      httpStatus: 404,
      finalUrl: null,
      durationMs: 100,
      error: "The page is gone (HTTP 404).",
    });

    (llm.invokeLLM as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      llmResponse("الصفحة اتشالت من الموقع، راجع [[1]].", [1])
    );

    const stored = await digest.generateRotDigest(1, run);

    expect(stored.narrativeStatus).toBe("ok");
    expect(stored.narrative).toContain("Gone page");
    expect(stored.model).toBe("gpt-5-mini");
    expect(stored.promptTokens).toBe(120);
    expect(stored.completionTokens).toBe(40);
    expect(stored.estimatedPromptTokens).toBeGreaterThan(0);
  });
}, 20000);
