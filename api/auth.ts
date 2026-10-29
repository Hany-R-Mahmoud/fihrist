import { appAuth } from "../server/_core/appAuth.js";

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.searchParams.get("authPath");
    if (path) {
      url.pathname = `/api/auth/${path}`;
      url.searchParams.delete("authPath");
    }
    let auth: ReturnType<typeof appAuth>;
    try {
      auth = appAuth();
    } catch {
      return Response.json({ error: "Sign-in is temporarily unavailable" }, {
        status: 503, headers: { "Cache-Control": "no-store" },
      });
    }
    const response = await auth.handler(new Request(url, request));
    response.headers.set("Cache-Control", "no-store");
    return response;
  },
};
