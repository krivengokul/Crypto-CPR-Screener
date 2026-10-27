/**
 * Outbound alert webhook — sends entry-cross events to your Cloudflare Worker,
 * which forwards them to Telegram. The Worker URL is the only thing stored
 * here; the Telegram bot token lives in Cloudflare as a secret.
 *
 * Flow:  Browser  →  Cloudflare Worker  →  Telegram Bot API
 *
 * Telegram copy (worker should prefer `telegramText` if present):
 * - side / action = LONG | SHORT (not BUY / SELL)
 * - no exchange name under the symbol (source left empty for display)
 */

const STORAGE_KEY = "cpr_alert_webhook_url_v1";
/** Cross-tab / double-post guard for the same signal within a short window. */
const RECENT_POST_KEY = "cpr_alert_webhook_recent_v1";
const RECENT_POST_TTL_MS = 5 * 60_000; // 5 minutes

export const ALERT_WEBHOOK_CHANGED_EVENT = "cpr-alert-webhook-changed";

export type AlertWebhookEventType = "entry_crossed";

export interface AlertWebhookPayload {
  event: AlertWebhookEventType;
  symbol: string;
  /**
   * Display source for Telegram. Intentionally empty so workers that print
   * `source` under the symbol do not show "binance". Original exchange is in
   * `exchange`.
   */
  source: string;
  /** Original exchange id (binance | delta | …). Prefer not to print on Telegram. */
  exchange?: string;
  direction: "Up" | "Down" | string;
  /** LONG or SHORT — use this (not BUY/SELL). */
  side: "LONG" | "SHORT";
  /** Same as side — some workers map `action`. */
  action: "LONG" | "SHORT";
  price: number | string;
  entry: number | string;
  entryLevel?: string;
  target?: number | string;
  stop?: number | string;
  riskReward?: string;
  viewLabel?: string;
  viewCode?: string;
  timestamp: number;
  timestampISO: string;
  /** Stable key so Worker / client can drop duplicate posts. */
  idempotencyKey: string;
  /**
   * Ready-to-send Telegram text. Prefer this in the Cloudflare Worker
   * so BUY/SELL and exchange labels are not re-derived incorrectly.
   */
  telegramText: string;
}

export function getAlertWebhookUrl(): string {
  try {
    return (localStorage.getItem(STORAGE_KEY) || "").trim();
  } catch {
    return "";
  }
}

export function setAlertWebhookUrl(url: string): void {
  const next = url.trim();
  try {
    if (next) localStorage.setItem(STORAGE_KEY, next);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore quota */
  }
  try {
    window.dispatchEvent(new CustomEvent(ALERT_WEBHOOK_CHANGED_EVENT, { detail: next }));
  } catch {
    /* ignore */
  }
}

function isPlausibleWebhookUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

function pageIsHidden(): boolean {
  if (typeof document === "undefined") return false;
  return document.visibilityState === "hidden";
}

function utcDayISO(ts = Date.now()): string {
  return new Date(ts).toISOString().slice(0, 10);
}

/** Drop duplicate posts for the same signal across tabs / double-fire. */
function shouldSkipDuplicatePost(idempotencyKey: string): boolean {
  if (typeof localStorage === "undefined" || !idempotencyKey) return false;
  try {
    const raw = localStorage.getItem(RECENT_POST_KEY);
    const map: Record<string, number> = raw ? JSON.parse(raw) : {};
    const now = Date.now();
    let changed = false;
    for (const k of Object.keys(map)) {
      if (now - map[k] > RECENT_POST_TTL_MS) {
        delete map[k];
        changed = true;
      }
    }
    if (map[idempotencyKey] && now - map[idempotencyKey] < RECENT_POST_TTL_MS) {
      if (changed) localStorage.setItem(RECENT_POST_KEY, JSON.stringify(map));
      return true;
    }
    map[idempotencyKey] = now;
    localStorage.setItem(RECENT_POST_KEY, JSON.stringify(map));
    return false;
  } catch {
    return false;
  }
}

function formatTelegramText(args: {
  side: "LONG" | "SHORT";
  direction?: "Up" | "Down" | string;
  symbol: string;
  price: number | string;
  entry: number | string;
  entryLevel?: string;
  target?: number | string;
  stop?: number | string;
  riskReward?: string;
  viewLabel?: string;
  viewCode?: string;
}): string {
  const dir =
    args.direction === "Up" || args.side === "LONG" ? "⬆️" : "⬇️";
  const sideIcon = args.side === "LONG" ? "🟢 LONG" : "🔴 SHORT";
  // ⬆️ SYMBOL  🟢 LONG
  const lines: string[] = [
    `${dir} ${args.symbol}  ${sideIcon}`,
  ];
  lines.push(`💰 Price: ${args.price}`);
  const entryLvl = (args.entryLevel || "Entry").trim();
  lines.push(`📍 Entry: ${entryLvl} (${args.entry})`);
  if (args.target !== undefined && args.target !== "") {
    lines.push(`🎯 Target: ${args.target}`);
  }
  if (args.stop !== undefined && args.stop !== "") {
    lines.push(`🛑 Stop: ${args.stop}`);
  }
  if (args.riskReward) {
    lines.push(`⚖️ R:R ${args.riskReward}`);
  }
  // View name stays in the in-app toast only — omit from Telegram.
  return lines.join("\n");
}

/**
 * POST to your Cloudflare Worker.
 * Returns true if the browser accepted a successful send (2xx or beacon ok).
 * Never throws; failures are console-warned and return false so the caller
 * can surface a short error next to the entry-cross toast.
 */
export async function postAlertWebhook(payload: AlertWebhookPayload): Promise<boolean> {
  const url = getAlertWebhookUrl();
  if (!url || !isPlausibleWebhookUrl(url)) {
    console.warn("[alertWebhook] no valid Hook URL configured");
    return false;
  }

  if (shouldSkipDuplicatePost(payload.idempotencyKey)) {
    console.info("[alertWebhook] skip duplicate", payload.idempotencyKey);
    return true; // treat as success so UI does not show "Telegram alert failed"
  }

  const body = JSON.stringify(payload);

  const tryBeacon = (): boolean => {
    try {
      if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
        const blob = new Blob([body], { type: "application/json" });
        return navigator.sendBeacon(url, blob);
      }
    } catch {
      /* ignore */
    }
    return false;
  };

  const doPost = async (): Promise<boolean> => {
    // Background tab: beacon only (do not also fetch — avoids double Telegram).
    if (pageIsHidden()) {
      return tryBeacon();
    }

    // Active tab: fetch only. No beacon fallback after OK/ambiguous responses
    // (fetch + beacon was a common cause of duplicate Telegram messages).
    try {
      const res = await fetch(url, {
        method: "POST",
        cache: "no-store",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.warn("[alertWebhook] worker returned", res.status, text);
        return false;
      }
      return true;
    } catch (err) {
      console.warn("[alertWebhook] post failed", err);
      // Last resort when fetch cannot run (e.g. page unloading mid-request).
      return tryBeacon();
    }
  };

  // Cross-tab lock when supported so two open screener tabs do not both POST
  // the same idempotencyKey at the same moment (Worker also dedupes).
  const locks = typeof navigator !== "undefined" ? (navigator as Navigator & {
    locks?: { request: (name: string, opts: { ifAvailable: boolean }, cb: (lock: unknown) => Promise<boolean>) => Promise<boolean | undefined> };
  }).locks : undefined;

  if (locks && payload.idempotencyKey) {
    try {
      const result = await locks.request(
        `cpr-alert-webhook:${payload.idempotencyKey}`,
        { ifAvailable: true },
        async (lock) => {
          if (!lock) {
            console.info("[alertWebhook] skip — another tab holds the lock", payload.idempotencyKey);
            return true;
          }
          return doPost();
        },
      );
      // ifAvailable + no lock → callback may not run; treat as success (other tab sends).
      if (result === undefined) {
        console.info("[alertWebhook] skip — lock not available", payload.idempotencyKey);
        return true;
      }
      return result;
    } catch {
      return doPost();
    }
  }

  return doPost();
}

export function buildEntryCrossWebhookPayload(args: {
  symbol: string;
  source: string;
  direction: "Up" | "Down" | string;
  price: number;
  entry: number;
  entryLevel?: string;
  target?: number;
  stop?: number;
  riskReward?: string;
  viewLabel?: string;
  viewCode?: string;
  timestamp?: number;
}): AlertWebhookPayload {
  const timestamp = args.timestamp ?? Date.now();
  const dir = args.direction === "Up" || args.direction === "bullish" ? "Up" : "Down";
  const side: "LONG" | "SHORT" = dir === "Up" ? "LONG" : "SHORT";
  const price = Number.isFinite(args.price) ? args.price : String(args.price);
  const entry = Number.isFinite(args.entry) ? args.entry : String(args.entry);
  const idempotencyKey = [
    "entry_crossed",
    (args.symbol || "").toUpperCase(),
    (args.source || "").toLowerCase(),
    String(args.entry),
    (args.viewCode || args.viewLabel || "").trim(),
    utcDayISO(timestamp),
  ].join("|");

  return {
    event: "entry_crossed",
    symbol: args.symbol,
    // Empty so Telegram templates that print `source` under the symbol show nothing.
    source: "",
    exchange: args.source,
    direction: dir,
    side,
    action: side,
    price,
    entry,
    entryLevel: args.entryLevel,
    target: args.target,
    stop: args.stop,
    riskReward: args.riskReward,
    viewLabel: args.viewLabel,
    viewCode: args.viewCode,
    timestamp,
    timestampISO: new Date(timestamp).toISOString(),
    idempotencyKey,
    telegramText: formatTelegramText({
      side,
      direction: dir,
      symbol: args.symbol,
      price,
      entry,
      entryLevel: args.entryLevel,
      target: args.target,
      stop: args.stop,
      riskReward: args.riskReward,
      viewLabel: args.viewLabel,
      viewCode: args.viewCode,
    }),
  };
}
