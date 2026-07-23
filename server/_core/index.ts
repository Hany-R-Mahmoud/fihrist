import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import * as db from "../db";
import { processPendingJobsForUser, queueHealthChecksForUser } from "../services/jobProcessor";
import { subscribeToFihristEvents } from "../services/liveEvents";
import { createContext } from "./context";
import { sdk } from "./sdk";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  app.get("/api/events/fihrist", async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req);
      if (user.isCron) return res.status(403).json({ error: "user-session-required" });

      res.status(200).set({
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      res.flushHeaders();
      res.write(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`);

      const unsubscribe = subscribeToFihristEvents(user.id, event => {
        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      });
      const cleanup = () => unsubscribe();
      req.on("close", cleanup);
      res.on("close", cleanup);
    } catch {
      res.status(401).json({ error: "authentication-required" });
    }
  });
  app.post("/api/scheduled/fihrist-health", async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req);
      if (!user.isCron || !user.taskUid) {
        return res.status(403).json({ error: "cron-only" });
      }
      const settings = await db.getHealthSettingsByTaskUid(user.taskUid);
      if (!settings || !settings.enabled) {
        return res.json({ ok: true, skipped: "orphan-or-paused" });
      }
      const pendingCount = await db.countPendingJobsForUser(settings.userId, "health_check");
      const dueForWeeklySweep =
        !settings.lastRunAt ||
        Date.now() - settings.lastRunAt.getTime() >= 7 * 24 * 60 * 60 * 1000;
      const queuedCount = pendingCount === 0 && dueForWeeklySweep
        ? await queueHealthChecksForUser(settings.userId)
        : 0;
      if (queuedCount > 0) {
        await db.updateHealthSettings(settings.userId, { lastRunAt: new Date() });
      }
      const processing = await processPendingJobsForUser(settings.userId, "health_check", 100);
      return res.json({ ok: true, queuedCount, ...processing });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Scheduled health check failed";
      return res.status(500).json({
        error: message,
        context: { route: "/api/scheduled/fihrist-health" },
        timestamp: new Date().toISOString(),
      });
    }
  });
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
