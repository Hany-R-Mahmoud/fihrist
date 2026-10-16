import { describe, expect, it } from "vitest";
import { resolveCompatibleApiUrl } from "./llm";

describe("OpenAI-compatible BYOK URL handling", () => {
  it("does not duplicate /v1 in provider URLs", () => {
    expect(resolveCompatibleApiUrl("https://api.openai.com/v1", "chat/completions"))
      .toBe("https://api.openai.com/v1/chat/completions");
    expect(resolveCompatibleApiUrl("https://provider.example/v1/", "models"))
      .toBe("https://provider.example/v1/models");
  });
  it("accepts base URLs without the /v1 suffix", () => {
    expect(resolveCompatibleApiUrl("https://provider.example", "models"))
      .toBe("https://provider.example/v1/models");
  });
});
