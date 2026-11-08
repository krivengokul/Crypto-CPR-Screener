/**
 * CPR Screener — Telegram Alert Worker
 * =====================================
 * SINGLE SOURCE OF TRUTH for message text lives in the browser:
 *   artifacts/cpr-screener/src/lib/alertWebhook.ts → formatTelegramText()
 *
 * This Worker only:
 *   1) receives the JSON payload
 *   2) reads payload.telegramText
 *   3) sends it to Telegram with parse_mode = HTML
 *
 * It does NOT rebuild or re-icon the message. Redeploy this file on Cloudflare
 * whenever you change Worker CORS / secrets — not when you change icons.
 *
 * SETUP
 * -----
 * 1. Cloudflare Dashboard → Workers & Pages → your worker → Edit code
 * 2. Paste this file → Deploy
 * 3. Secrets: BOT_TOKEN, CHAT_ID
 * 4. Paste Worker URL into Screener → Hook field
 */

const ALLOWED_ORIGIN = "*";

export default {
  async fetch(request, env) {
    const reply = (body, status) => corsResponse(body, status, request);

    if (request.method === "OPTIONS") {
      return reply(null, 204);
    }

    if (request.method !== "POST") {
      return reply("Method Not Allowed", 405);
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return reply("Bad JSON", 400);
    }

    const botToken = env.BOT_TOKEN;
    const chatId = env.CHAT_ID;

    if (!botToken || !chatId) {
      console.error("Missing BOT_TOKEN or CHAT_ID secrets");
      return reply("Worker not configured", 500);
    }

    // ── Single source of truth: browser-built telegramText only ──
    const text =
      typeof payload.telegramText === "string" ? payload.telegramText.trim() : "";
    if (!text) {
      console.error("Missing payload.telegramText — refusing to invent a second format");
      return reply("Missing telegramText", 400);
    }

    try {
      const tgRes = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: "HTML",
            disable_web_page_preview: true,
          }),
        }
      );

      if (!tgRes.ok) {
        const err = await tgRes.text();
        console.error("Telegram error:", err);
        return reply("Telegram API error", 502);
      }
    } catch (err) {
      console.error("Fetch to Telegram failed:", err);
      return reply("Upstream error", 502);
    }

    return reply("OK", 200);
  },
};

function corsResponse(body, status, request) {
  const origin = request?.headers.get("Origin") || "";
  const headers = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
    "Content-Type": "text/plain",
  };
  if (origin && (ALLOWED_ORIGIN === "*" || origin === ALLOWED_ORIGIN)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  } else {
    headers["Access-Control-Allow-Origin"] = ALLOWED_ORIGIN;
  }
  return new Response(body, { status, headers });
}
