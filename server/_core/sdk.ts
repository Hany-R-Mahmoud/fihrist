import type { Request } from "express";
import { authenticateLocalUser } from "./localAuth";

export class SDKServer {
  async authenticateRequest(_req: Pick<Request, "headers">) {
    return authenticateLocalUser();
  }
}

export const sdk = new SDKServer();
