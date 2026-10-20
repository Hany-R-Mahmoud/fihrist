import { authenticateLocalUser } from "./localAuth.js";
import { authenticateCloudUser } from "./cloudAuth.js";

/** No remote request is ever treated as the local-user account. */
export class SDKServer {
  async authenticateRequest(req: { headers: unknown }) {
    if (process.env.FIHRIST_MODE === "cloud") {
      return authenticateCloudUser(req.headers);
    }
    return authenticateLocalUser();
  }
}
export const sdk = new SDKServer();
