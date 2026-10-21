/**
 * Neon Scheduled Function entry point.
 *
 * Deploy via `neon functions deploy fihristhealth --src neon/functions/health.ts`.
 * A Neon Function Trigger POSTs here every five minutes.
 * The scheduler never depends on Vercel; the existing worker, SSRF rules,
 * per-user queue, and digest logic run directly on Neon's Node.js 24 runtime.
 */
import { runNeonHealthTick, cloudWeeklyHealthEnabled } from "../../server/services/neonHealthScheduler.js";

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") return new Response(null, { status: 405 });
    // Neon strips spoofed client X-Neon-* headers, so this header is a
    // platform-attested scheduled invocation, not an ordinary public POST.
    if (!request.headers.get("x-neon-trigger-invocation-id")) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    if (process.env.FIHRIST_MODE !== "cloud" || !cloudWeeklyHealthEnabled()) {
      return Response.json({ ok: true, enabled: false, reason: "Scheduled checks disabled" });
    }
    try {
      const body = await request.json() as { data?: { scheduled_at?: unknown } };
      const scheduledAt = body?.data?.scheduled_at;
      if (typeof scheduledAt !== "string" || Number.isNaN(Date.parse(scheduledAt))) {
        return Response.json({ error: "Invalid scheduled occurrence" }, { status: 400 });
      }
      const result = await runNeonHealthTick();
      return Response.json({ ok: true, enabled: true, scheduledAt, ...result }, {
        headers: { "Cache-Control": "no-store" },
      });
    } catch (error) {
      console.error("[Fihrist] Neon scheduled health tick failed", error);
      return Response.json({ ok: false, error: "Scheduled health processing failed" }, {
        status: 503, headers: { "Cache-Control": "no-store" },
      });
    }
  },
};
