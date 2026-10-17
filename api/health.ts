import { sql } from "drizzle-orm";
import { openCloudDatabase } from "../server/_core/cloudDatabase";

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "GET") return new Response(null,{status:405});
    if (process.env.FIHRIST_MODE !== "cloud") return Response.json({status:"not-configured"}, {status:503});
    try {
      const db = openCloudDatabase();
      await db.execute(sql`select 1`);
      return Response.json({status:"ready",database:"neon"}, {headers:{"Cache-Control":"no-store"}});
    } catch {
      return Response.json({status:"database-unavailable"},{status:503,headers:{"Cache-Control":"no-store"}});
    }
  },
};
