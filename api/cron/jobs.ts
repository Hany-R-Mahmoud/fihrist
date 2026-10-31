import { createHash, timingSafeEqual } from "node:crypto";

function sameSecret(received:string|null, expected:string) {
  if(!received || !expected) return false;
  const a=createHash("sha256").update(received).digest();
  const b=createHash("sha256").update("Bearer "+expected).digest();
  return timingSafeEqual(a,b);
}

export default {
  async fetch(request:Request):Promise<Response> {
    if(request.method!=="GET")return new Response(null,{status:405});
    if(!process.env.CRON_SECRET || !sameSecret(request.headers.get("authorization"),process.env.CRON_SECRET)){
      return Response.json({error:"Unauthorized"},{status:401,headers:{"Cache-Control":"private, no-store"}});
    }
    try{
      return Response.json({ok:true,enabled:false,reason:"Checks run only on user request"},{headers:{"Cache-Control":"private, no-store"}});
    }catch(error) {
      console.error("[Fihrist] Scheduled job drain failed",error);
      return Response.json({ok:false,error:"Job processing unavailable"},{status:503,headers:{"Cache-Control":"private, no-store"}});
    }
  }
};
