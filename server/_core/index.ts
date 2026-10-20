import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers.js";
import { subscribeToFihristEvents } from "../services/liveEvents.js";
import { startLocalJobRunner } from "../services/localJobRunner.js";
import { createContext } from "./context.js";
import { assertRuntimeConfiguration, ENV } from "./env.js";
import { sdk } from "./sdk.js";
import { serveStatic, setupVite } from "./vite.js";

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
  assertRuntimeConfiguration();
  const app = express();
  const server = createServer(app);
  app.use(express.json({ limit: "3mb" }));
  app.use(express.urlencoded({ limit: "1mb", extended: true }));
  app.use("/api/trpc", (req, res, next) => {
    const origin = req.headers.origin;
    // Extension schemes have URL.origin === "null" in Node.js. Compare the
    // exact Origin header to the explicitly configured extension IDs instead.
    const allowedExtensionOrigins = (process.env.FIHRIST_EXTENSION_ORIGINS ?? "")
      .split(",")
      .map(value => value.trim())
      .filter(value => /^chrome-extension:\/\/[a-p]{32}$/.test(value));
    const isAllowedExtension = Boolean(origin && allowedExtensionOrigins.includes(origin));

    if (isAllowedExtension) {
      res.setHeader("Access-Control-Allow-Origin", origin!);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "content-type");
    }
    if (req.method === "OPTIONS") {
      res.status(isAllowedExtension ? 204 : 403).end();
      return;
    }
    if (req.method === "POST") {
      if (req.headers["sec-fetch-site"] === "cross-site" && !isAllowedExtension) {
        res.status(403).json({ error: "cross-site-request-blocked" });
        return;
      }
      if (origin && !isAllowedExtension) {
        try {
          const parsedOrigin = new URL(origin);
          if (!["http:", "https:"].includes(parsedOrigin.protocol) || parsedOrigin.host !== req.get("host")) {
            res.status(403).json({ error: "origin-mismatch" });
            return;
          }
        } catch {
          res.status(403).json({ error: "invalid-origin" });
          return;
        }
      }
    }
    next();
  });
  app.get("/api/events/fihrist", async (req, res) => {
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let cleanedUp = false;
    try {
      const user = await sdk.authenticateRequest(req);

      res.status(200).set({
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      res.flushHeaders();
      res.write(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`);
      heartbeat = setInterval(() => {
        if (!res.writableEnded) res.write(": keep-alive\n\n");
      }, 15_000);

      const unsubscribe = subscribeToFihristEvents(user.id, event => {
        if (!res.writableEnded) res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      });
      const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe();
      };
      // IncomingMessage 'close' can fire after request parsing while SSE is
      // still active; the response closing is the real stream-lifetime signal.
      res.on("close", cleanup);
    } catch (error) {
      console.debug(
        "[Fihrist] SSE authentication failed:",
        error instanceof Error ? error.message : "unknown error"
      );
      res.status(401).json({ error: "authentication-required" });
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

  const host = process.env.HOST || "127.0.0.1";
  const stopJobRunner = startLocalJobRunner();
  server.once("close", stopJobRunner);
  server.listen(port, host, () => {
    console.log(`Server running on http://${host}:${port}/`);
  });
}

startServer().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
