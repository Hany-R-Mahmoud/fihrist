# AI / LLM features

- Exactly one AI integration, through the existing BYOK path — no second provider, wrapper, or endpoint. Confidence: 0.9
- Layers AI features: the deterministic facts layer is the product and always ships; the LLM narrative is optional voice on top. Confidence: 0.9
- The product must work fully with no API key configured; "no key" is an honestly badged state, not an error. Confidence: 0.9
- Exactly one LLM attempt, no retry loop; a failure never blocks the underlying job, never corrupts recorded data, and never leaves the feature absent. Confidence: 0.9
- Grounds LLM output in a structured facts payload and validates it before use: reject output that names entities outside the facts or asserts a cause the server did not record, then fall back to the facts alone. Confidence: 0.9
- Caps LLM input by construction (aggregated facts + capped item lists, never the full dataset) and caps output (max tokens and a word limit). Confidence: 0.85
- Surfaces cost the way the existing AI path does: an estimate before the call, actual model and token counts recorded and shown after. Confidence: 0.85
- Treats inconclusive results as "needs review", never as dead. Confidence: 0.9
- Requires a poisoned-fixture test proving the grounding guard rejects a bad model response. Confidence: 0.8
- Exercises the LLM feature through the real code path (invoke → model resolution → grounding guard → store → render) against a local OpenAI-compatible server, covering the accepted narrative and every rejection case; a mocked LLM alone is not accepted as coverage. Confidence: 0.85
- Treats the grounding guard's conservative rejection as the intended safe failure, and warns that a real model will be less obedient than the fixture, so rejection logs are worth watching on the first real run. Confidence: 0.7
