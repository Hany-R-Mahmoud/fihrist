import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listAvailableJobs: vi.fn(),
  completeDrainedHealthRuns: vi.fn().mockResolvedValue([]),
  processBookmarkJob: vi.fn().mockResolvedValue({ status: "completed" }),
  acquireDomainSlot: vi.fn().mockResolvedValue(true),
  releaseDomainSlot: vi.fn(),
}));
vi.mock("../data.js", () => ({ db: mocks }));
vi.mock("./jobProcessor.js", () => ({
  processBookmarkJob: mocks.processBookmarkJob,
  openHealthRun: vi.fn(),
  queueHealthChecksForUser: vi.fn(),
}));
vi.mock("./rotDigest.js", () => ({ onHealthRunCompleted: vi.fn() }));

import { drainCloudJobs } from "./cloudJobDrain";
import { cloudWeeklyHealthEnabled, runNeonHealthTick } from "./neonHealthScheduler";
import cron from "../../api/cron/jobs";

afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });

describe("on-demand job safeguards", () => {
  it("never enables a retired schedule through the old environment flag", async () => {
    vi.stubEnv("FIHRIST_MODE", "cloud");
    vi.stubEnv("FIHRIST_ENABLE_CLOUD_WEEKLY_HEALTH", "true");
    expect(cloudWeeklyHealthEnabled()).toBe(false);
    expect(await runNeonHealthTick()).toMatchObject({ enabled: false });
    expect(mocks.listAvailableJobs).not.toHaveBeenCalled();
  });

  it("does no work even when an old cron caller has the correct secret", async () => {
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    const response = await cron.fetch(new Request("https://example.org/api/cron/jobs", {
      headers: { authorization: "Bearer test-cron-secret" },
    }));
    expect(await response.json()).toMatchObject({ enabled: false });
    expect(mocks.listAvailableJobs).not.toHaveBeenCalled();
  });

  it("caps a requested batch at four and restricts it to its owner and type", async () => {
    mocks.listAvailableJobs.mockResolvedValue([{ id: 1, userId: 7 }]);
    expect(await drainCloudJobs(700, 7, "health_check")).toMatchObject({ processed: 1, completed: 1 });
    expect(mocks.listAvailableJobs).toHaveBeenCalledWith("health_check", 4, 7);
    expect(mocks.processBookmarkJob).toHaveBeenCalledTimes(1);
    expect(mocks.releaseDomainSlot).toHaveBeenCalledWith("fihrist:user-batch:7", expect.any(String));
  });

  it("does not start another batch while the account batch lease is held", async () => {
    mocks.acquireDomainSlot.mockResolvedValueOnce(false);
    expect(await drainCloudJobs(4, 7)).toMatchObject({ processed: 0 });
    expect(mocks.listAvailableJobs).not.toHaveBeenCalled();
  });
});
