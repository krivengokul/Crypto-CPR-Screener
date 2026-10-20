/**
 * Outbound alert webhook — sends entry-cross events to your Cloudflare Worker,
 * which forwards them to Telegram. The Worker URL is the only thing stored
 * here; the Telegram bot token lives in Cloudflare as a secret.
 *
 * Flow:  Browser  →  Cloudflare Worker  →  Telegram Bot API
 *
 * Reliability:
 * - Prefer fetch() while the page is active so every entry-cross toast also
 *   reaches Telegram and failures show in the Network tab / console.
 * - Use sendBeacon only when the document is hidden (background tab), where
 *   fetch may be cancelled, or as a last-resort fallback if fetch fails.
 */

const STORAGE_KEY = "cpr_alert_webhook_url_v1";
export const ALERT_WEBHOOK_CHANGED_EVENT = "cpr-alert-webhook-changed";

export type AlertWebhookEventType = "entry_crossed";

export interface AlertWebhookPayload {
  event: AlertWebhookEventType;
  symbol: string;
  source: string;
  direction: "Up" | "Down" | string;
  side: "LONG" | "SHORT";
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

/**
 * POST to your Cloudflare Worker.
 * Returns true if the browser accepted a successful send (2xx or beacon ok).
 * Never throws; failures are console-warned and return false so the caller
 * can surface a short error next to the entry-cross toast.
 */
export async function postAlertWebhook(payload: AlertWebhookPayload): Promise<boolean> {
  const url = getAlertWebhookUrl();
  if (!url || !isPlausibleWebhookUrl(url)) {
    console.warn("[alertWebhook] no Hook URL configured — Telegram skipped");
    return false;
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

  // Background tab: beacon first (more likely to flush under suspension).
  if (pageIsHidden() && tryBeacon()) {
    return true;
  }

  // Active tab (or beacon unavailable): fetch with keepalive so the request
  // is visible in Network and more reliable than beacon-only.
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
      // One beacon retry after a non-OK response (e.g. transient 502).
      if (tryBeacon()) return true;
      return false;
    }
    return true;
  } catch (err) {
    if (tryBeacon()) return true;
    console.warn("[alertWebhook] post failed", err);
    return false;
  }
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
  return {
    event: "entry_crossed",
    symbol: args.symbol,
    source: args.source,
    direction: dir,
    side: dir === "Up" ? "LONG" : "SHORT",
    price: Number.isFinite(args.price) ? args.price : String(args.price),
    entry: Number.isFinite(args.entry) ? args.entry : String(args.entry),
    entryLevel: args.entryLevel,
    target: args.target,
    stop: args.stop,
    riskReward: args.riskReward,
    viewLabel: args.viewLabel,
    viewCode: args.viewCode,
    timestamp,
    timestampISO: new Date(timestamp).toISOString(),
  };
}
