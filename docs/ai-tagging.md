# AI tag suggestions (BYOK) — الوسوم المقترحة بالذكاء الاصطناعي

Fihrist can ask **your own** LLM for tag suggestions. Bring your own key —
OpenAI-compatible endpoint. Nothing is ever auto-applied: every suggestion waits
in a **pending** state until you approve or reject it.

## Setup — الإعداد

Set these on the server (`.env` or environment), then restart:

```
FIHRIST_AI_BASE_URL=https://api.openai.com/v1   # or any OpenAI-compatible endpoint
FIHRIST_AI_API_KEY=sk-...                        # your key — never commit this
FIHRIST_AI_MODEL=gpt-5-mini                    # optional; needed if provider has no /models endpoint
```

These variables also power the existing bookmark-insight analysis.
Without them, AI features stay off and the rule-based tagger keeps working
exactly as before.

## How it works — إزاي بيشتغل

1. **On save:** after the normal scrape + rule-based tags, the server asks the
   LLM for 4–8 specific tags (Arabic tags for Arabic pages, same-language
   otherwise). Suggestions are stored as **pending**.
2. **On demand:** each bookmark card shows an "AI tag suggestions" panel with a
   **Suggest tags** button.
3. **Approval:** each suggestion has ✓ (approve) and ✕ (reject). Approving
   creates the tag (marked source `ai`); rejecting discards it. The card refreshes
   live when background suggestions arrive.

## Cost awareness — التكلفة

- Every suggestion run reports its token usage (`~N in / M out tokens`) in the
  confirmation toast — multiply by your endpoint's pricing to know the cost.
- Content sent to the LLM is clipped (title 300 chars, description 800, page
  text 6000) to bound input size.
- If the LLM call fails, the ingestion job still succeeds — rule-based tags are
  unaffected and the failure is logged server-side.

## Guardrails

- The key lives server-side only — it is never sent to the browser and never
  committed to the repo.
- Suggestions are deduplicated against tags the bookmark already has.
- Malformed or unreadable AI responses are rejected with a plain-language error,
  never applied.
