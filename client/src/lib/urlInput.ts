import type { MessageKey } from "@/i18n/dictionary";

/**
 * Checks a pasted link before it is sent anywhere, so the user always gets the
 * message in the interface language. The server and the guest store still
 * validate; this only decides which localized message to show first.
 */
export function bookmarkUrlProblem(raw: string): MessageKey | null {
  const value = raw.trim();
  if (!value) return null;
  if (value.length > 2048) return "dialog.urlTooLong";
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return "dialog.urlInvalid";
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password
  )
    return "dialog.urlUnsupported";
  return null;
}
