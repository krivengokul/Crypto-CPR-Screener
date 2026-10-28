/**
 * Telegram `parse_mode: "HTML"` rejects the whole message if a value contains
 * an unescaped `<`, `>` or `&`. Escape every interpolated value; only the
 * intentional markup (e.g. the <i> timestamp wrapper) stays raw.
 */
export function escapeTelegramHtml(value: string | number | undefined | null): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
