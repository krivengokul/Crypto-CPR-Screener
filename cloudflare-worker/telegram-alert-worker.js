/**
 * CPR Screener — Telegram Alert Worker
 * =====================================
 * Deploy this script to Cloudflare Workers (free tier: 100k req/day).
 *
 * SETUP
 * -----
 * 1. Go to https://dash.cloudflare.com → Workers & Pages → Create Worker
 * 2. Paste this file and click Deploy.
 * 3. Add two secrets via Settings → Variables → Secrets:
 *      BOT_TOKEN  — your Telegram bot token  (from @BotFather)
 *      CHAT_ID    — your Telegram chat/channel id (use @userinfobot to find it)
 * 4. Copy the Worker URL (e.g. https://cpr-alert.YOUR-NAME.workers.dev)
 * 5. Paste that URL into the CPR Screener → Hook field in the sidebar.
 *
 * The screener POSTs JSON to this Worker on every entry-cross alert.
 * The Worker formats a Telegram message and sends it — your bot token
 * never leaves Cloudflare.
 */

// "*" = any site may call this Worker. Set it to your app's origin, e.g.
// "https://krivengokul.github.io", to lock it down. Either way the Worker echoes
// the caller's Origin (never a bare "*") when the request is credentialed —
// navigator.sendBeacon always is, and browsers reject "*" for those requests.
const ALLOWED_ORIGIN = "*";

export default {
  async fetch(request, env) {
    const reply = (body, status) => corsResponse(body, status, request);

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return reply(null, 204);
    }

    if (request.method !== "POST") {
      return reply("Method Not Allowed", 405);
    }

    // Parse incoming JSON payload from the screener
    let payload;
    try {
      payload = await request.json();
    } catch {
      return reply("Bad JSON", 400);
    }

    const botToken = env.BOT_TOKEN;
    const chatId   = env.CHAT_ID;

    if (!botToken || !chatId) {
      console.error("Missing BOT_TOKEN or CHAT_ID secrets");
      return reply("Worker not configured", 500);
    }

    const text = formatTelegramMessage(payload);

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

// ─── Message formatter ────────────────────────────────────────────────────────

function formatTelegramMessage(p) {
  const side     = p.side === "LONG"  ? "🟢 LONG"  : "🔴 SHORT";
  const dir      = p.direction === "Up" ? "⬆️" : "⬇️";
  const symbol   = escHtml(p.symbol ?? "—");
  const source   = escHtml(p.source ?? "");
  // View name stays in the in-app toast only — omit from Telegram.
  const entry    = fmt(p.entry);
  const target   = fmt(p.target);
  const stop     = fmt(p.stop);
  const rr       = p.riskReward ? escHtml(p.riskReward) : null;
  const price    = fmt(p.price);
  const timeStr  = p.timestampISO
    ? new Date(p.timestampISO).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: true })
    : "";

  const lines = [
    `${dir} <b>${symbol}</b>  ${side}`,
    `<i>${source}</i>`,
  ];

  lines.push(`💰 Price: <code>${price}</code>`);
  // Entry → pin; Target → former Entry bullseye (🎯).
  if (entry)  lines.push(`📍 Entry: <code>${entry}</code>`);
  if (target) lines.push(`🎯 Target: <code>${target}</code>`);
  if (stop)   lines.push(`🛑 Stop: <code>${stop}</code>`);
  if (rr)     lines.push(`⚖️ R:R  ${rr}`);
  if (timeStr)lines.push(`🕐 ${timeStr} IST`);

  return lines.join("\n");
}

function fmt(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n < 1 ? n.toFixed(6) : n.toFixed(2);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ─── CORS helper ─────────────────────────────────────────────────────────────

function corsResponse(body, status, request) {
  const origin = request?.headers.get("Origin") || "";
  const headers = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
    "Content-Type": "text/plain",
  };
  if (origin && (ALLOWED_ORIGIN === "*" || origin === ALLOWED_ORIGIN)) {
    // Credentialed requests (sendBeacon) need the exact origin, not "*",
    // plus Allow-Credentials. Harmless for plain fetch.
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  } else {
    headers["Access-Control-Allow-Origin"] = ALLOWED_ORIGIN;
  }
  return new Response(body, { status, headers });
}
