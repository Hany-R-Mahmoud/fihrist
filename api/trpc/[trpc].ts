import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "../../server/routers";
import { sdk } from "../../server/_core/sdk";
import type { TrpcContext } from "../../server/_core/context";

// Vercel Node Function. Never runs the local Express server or SQLite runner.
export default async function handler(request: Request): Promise<Response> {
    if (process.env.FIHRIST_MODE !== "cloud") {
      return Response.json({ error: "Neon cloud mode not configured" }, { status: 503, headers: {"Cache-Control":"no-store"} });
    }
    const origin = request.headers.get("origin");
    if (request.method !== "GET" && origin) {
      try {
        const parsed = new URL(origin);
        const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
        if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") return Response.json({error:"Forbidden origin"}, {status:403});
        if (parsed.host !== host) return Response.json({error:"Forbidden origin"},{status:403});
      } catch {
        return Response.json({error:"Invalid origin"},{status:403});
      }
    }
    let user: TrpcContext["user"] = null;
    try {
      user = await sdk.authenticateRequest({headers:request.headers} as never);
    } catch { /* Public auth.me returns null; protected procedures return UNAUTHORIZED. */ }
    return fetchRequestHandler({
      endpoint: "/api/trpc",
      req: request,
      router: appRouter,
      createContext: async () => ({req:request,res:null,user} as unknown as TrpcContext),
      responseMeta() {
        return { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } };
      },
    });
}
