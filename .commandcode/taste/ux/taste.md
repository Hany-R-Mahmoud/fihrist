# Product & UI

- Arabic-first product: Arabic is the default, English is one toggle away, document-level lang/dir, correct RTL, and LTR isolation for URLs and codes. Confidence: 0.9
- Never lets color alone carry a state — every state is written as text, with color as support only. Confidence: 0.9
- Never shows a raw HTTP code or error string alone; always pairs it with a plain-language sentence the reader can act on. Confidence: 0.9
- Treats the design system as the source of truth: reuse named tokens and components by name, no new palette, no rebrand, and the smallest extension of an existing variant when nothing fits. Confidence: 0.9
- Uses an existing i18n/dictionary pattern for every new string, in both languages. Confidence: 0.85
- Keeps a calm, librarian's-note register even when reporting breakage — never an alarm panel. Confidence: 0.85
- Never renders raw markdown to the user; prose only. Confidence: 0.85
- Bounds long lists (a fixed latest-N with "load more") and keeps long URLs wrapping inside the row — verified with no horizontal scroll at 375px. Confidence: 0.85
- Every surfaced item carries an action; an item without an action is a log entry, not a tool. Confidence: 0.85
- Surfaces new features where the user already looks (the main home surface) rather than on a separate page they must remember to visit. Confidence: 0.8
- Makes every mode/state of a UI explicit on screen (e.g. which filter is active) — never a silent default. Confidence: 0.8
- When a record's data cannot be read, shows an explicit "could not be read" state with a recovery hint instead of rendering nothing; never lets a surface silently vanish. Confidence: 0.8
- Keeps prose out of tiny labels: a full sentence gets its own line rather than being squeezed into a 10px badge. Confidence: 0.7
- Every action must leave visible evidence where the user acted: on a snapshot surface the outcome replaces the action in place, so a dismissed or updated item never looks untouched. Confidence: 0.75
- Numbers shown in a report describe that report's own visible contents — a count never includes items the report did not show. Confidence: 0.75
