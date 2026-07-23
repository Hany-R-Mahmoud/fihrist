export const ENV = {
  ownerOpenId: "local-user",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.FIHRIST_AI_BASE_URL ?? process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.FIHRIST_AI_API_KEY ?? process.env.BUILT_IN_FORGE_API_KEY ?? "",
};

export function assertRuntimeConfiguration() {
  if (ENV.isProduction && process.env.HOST && process.env.HOST !== "127.0.0.1") {
    throw new Error("Fihrist local mode must bind to 127.0.0.1");
  }
}
