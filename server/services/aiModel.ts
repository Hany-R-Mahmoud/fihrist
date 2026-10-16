import { listLLMModels } from "../_core/llm";

let cachedModel: { model: string; expiresAt: number } | undefined;

export async function resolveAiModel(): Promise<string> {
  const explicit = process.env.FIHRIST_AI_MODEL?.trim();
  if (explicit) return explicit;
  if (cachedModel && cachedModel.expiresAt > Date.now()) return cachedModel.model;

  const catalog = await listLLMModels().catch(() => undefined);
  const ids = catalog?.data?.map(entry => entry.id).filter(Boolean) ?? [];
  const model =
    ids.find(id => id === "gpt-5-mini") ??
    ids.find(id => id.startsWith("gpt-5-")) ??
    ids.find(id => id.startsWith("gpt-")) ??
    ids[0];
  if (!model) {
    throw new Error("Unable to select an AI model. Set FIHRIST_AI_MODEL for your provider.");
  }
  cachedModel = { model, expiresAt: Date.now() + 10 * 60_000 };
  return model;
}
