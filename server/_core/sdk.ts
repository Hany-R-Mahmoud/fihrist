import type { Request } from "express";
import { authenticateLocalUser } from "./localAuth";
import { authenticateCloudUser } from "./cloudAuth";

/** No remote request is ever treated as the local-user account. */
export class SDKServer {
  async authenticateRequest(req: Pick<Request, "headers">) {
    if (process.env.FIHRIST_MODE === "cloud") {
      return authenticateCloudUser(req.headers);
    }
    return authenticateLocalUser();
  }
}
export const sdk = new SDKServer();
