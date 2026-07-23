# Fihrist AI Model Selection

The live built-in model catalog was reviewed on 22 July 2026. It included `gpt-5-nano`, `gpt-5-mini`, `gpt-5`, `gpt-5.5`, Claude 4.5/4.6/4.7 options, and Gemini 3 options.

Fihrist uses a cost-conscious structured analysis flow. The server will discover the live catalog at runtime and prefer `gpt-5-mini` for concise bookmark summaries and saved-link value analysis, falling back to an available model rather than hard-coding an unavailable identifier. The model is invoked only on the server and receives bounded bookmark metadata and cached content text; no user credentials or browser session information is sent to the model.

Structured JSON output will be validated before persistence. The requested fields are a concise summary, a rationale for saving the link, and a practical expected benefit.
