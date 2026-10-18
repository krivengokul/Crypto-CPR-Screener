/**
 * Optional outbound webhook for signal alerts (option B).
 * App POSTs JSON to the URL you configure; n8n / Make / a Worker can
 * forward to Telegram without putting a bot token in the browser.
 *
 * Uses text/plain + no-cors so browser clients can hit typical webhook
 * endpoints that do not send CORS headers. The receiver still gets the body.
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

/**
 * Fire-and-forget POST. Never throws to callers; failures are console-warned.
 */
export async function postAlertWebhook(payload: AlertWebhookPayload): Promise<void> {
  const url = getAlertWebhookUrl();
  if (!url || !isPlausibleWebhookUrl(url)) return;

  const body = JSON.stringify(payload);
  try {
    // Prefer sendBeacon when available (survives tab backgrounding briefly).
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
      const ok = navigator.sendBeacon(url, blob);
      if (ok) return;
    }
  } catch {
    /* fall through to fetch */
  }

  try {
    await fetch(url, {
      method: "POST",
      mode: "no-cors",
      cache: "no-store",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body,
    });
  } catch (err) {
    console.warn("[alertWebhook] post failed", err);
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
