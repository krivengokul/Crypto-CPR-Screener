/**
 * Outbound alert webhook — sends entry-cross events to your Cloudflare Worker,
 * which forwards them to Telegram. The Worker URL is the only thing stored
 * here; the Telegram bot token lives in Cloudflare as a secret.
 *
 * Flow:  Browser  →  Cloudflare Worker  →  Telegram Bot API
 *
 * Telegram copy (worker rebuilds from fields so every message has the same icons):
 * - payload side / action stay LONG | SHORT; the Telegram text shows BUY / SELL
 * - icons on every line; never viewcode / view name / exchange
 */

import { getView, shortLevelLabel } from "@/lib/views";
import { escapeTelegramHtml as esc } from "@/lib/telegramHtml";

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
  /** LONG or SHORT (Telegram text displays BUY / SELL). */
  side: "LONG" | "SHORT";
  /** Same as side — some workers map `action`. */
  action: "LONG" | "SHORT";
  price: number | string;
  entry: number | string;
  entryLevel?: string;
  target?: number | string;
  targetLevel?: string;
  stop?: number | string;
  stopLevel?: string;
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
  /** Worker must send this as Telegram parse_mode (HTML). */
  telegramParseMode: "HTML";
  /** Prefer telegramText only — do not rebuild message on the Worker. */
  useTelegramTextOnly: true;
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

/**
 * SINGLE source of Telegram body text for entry-cross alerts.
 * Cloudflare Worker must send `telegramText` as-is (parse_mode = HTML)
 * and must NOT rebuild the message from individual fields.
 */
function formatTelegramText(args: {
  side: "LONG" | "SHORT";
  direction?: "Up" | "Down" | string;
  symbol: string;
  price: number | string;
  entry: number | string;
  entryLevel?: string;
  target?: number | string;
  targetLevel?: string;
  stop?: number | string;
  stopLevel?: string;
  riskReward?: string;
  timestampISO?: string;
}): string {
  const isLong =
    args.side === "LONG" ||
    args.direction === "Up" ||
    args.direction === "bullish";
  // No direction icon before symbol. Solid triangle (not round 🟢/🔴) before BUY/SELL.
  const sideTag = isLong ? "▲ BUY" : "▼ SELL";
  // Bold symbol (Worker must use parse_mode = HTML).
  const lines: string[] = [`<b>${esc(args.symbol)}</b>  ${sideTag}`];
  lines.push(`💰 Price: ${esc(args.price)}`);

  const withLevel = (value: number | string, level?: string) => {
    const lvl = (level || "").trim();
    return lvl ? `${esc(value)} (${esc(lvl)})` : esc(value);
  };

  // Green lollipop for Entry (replaces 📍).
  const entryLvl = (args.entryLevel || "").trim();
  lines.push(`🍭 Entry: ${withLevel(args.entry, entryLvl)}`);

  if (args.target !== undefined && args.target !== "") {
    lines.push(`🎯 Target: ${withLevel(args.target, args.targetLevel)}`);
  }
  // Red firecracker for Exit (replaces 🚪).
  if (args.stop !== undefined && args.stop !== "") {
    lines.push(`🧨 Exit: ${withLevel(args.stop, args.stopLevel)}`);
  }
  if (args.riskReward) {
    lines.push(`⚖️ R/R: ${esc(args.riskReward)}`);
  }
  if (args.timestampISO) {
    try {
      // Italic only — no clock icon. Telegram has no true small-font tag.
      const timeStr = new Date(args.timestampISO).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      });
      if (timeStr) {
        lines.push(`<i>${esc(timeStr)} IST</i>`);
      }
    } catch {
      /* ignore */
    }
  }
  // Never include viewLabel / viewCode / exchange on Telegram.
  return lines.join("\n");
}

/** Fill missing Entry/Target/Exit level labels from the View def when possible. */
function resolveLevelLabels(args: {
  entryLevel?: string;
  targetLevel?: string;
  stopLevel?: string;
  viewCode?: string;
}): { entryLevel?: string; targetLevel?: string; stopLevel?: string } {
  let entryLevel = (args.entryLevel || "").trim() || undefined;
  let targetLevel = (args.targetLevel || "").trim() || undefined;
  let stopLevel = (args.stopLevel || "").trim() || undefined;
  if (entryLevel && targetLevel && stopLevel) {
    return { entryLevel, targetLevel, stopLevel };
  }
  try {
    const code = (args.viewCode || "").trim();
    if (!code) return { entryLevel, targetLevel, stopLevel };
    const view = getView(code);
    if (!view) return { entryLevel, targetLevel, stopLevel };
    if (!entryLevel && view.entryLabel) entryLevel = shortLevelLabel(view.entryLabel) || view.entryLabel;
    if (!targetLevel && view.targetLabel) targetLevel = shortLevelLabel(view.targetLabel) || view.targetLabel;
    if (!stopLevel && view.stoplossLabel) stopLevel = shortLevelLabel(view.stoplossLabel) || view.stoplossLabel;
  } catch {
    /* views unavailable */
  }
  return { entryLevel, targetLevel, stopLevel };
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
  targetLevel?: string;
  stop?: number;
  stopLevel?: string;
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

  const levels = resolveLevelLabels({
    entryLevel: args.entryLevel,
    targetLevel: args.targetLevel,
    stopLevel: args.stopLevel,
    viewCode: args.viewCode,
  });
  const timestampISO = new Date(timestamp).toISOString();

  // ONE message body — Worker must forward telegramText only (no second template).
  const telegramText = formatTelegramText({
    side,
    direction: dir,
    symbol: args.symbol,
    price,
    entry,
    entryLevel: levels.entryLevel,
    target: args.target,
    targetLevel: levels.targetLevel,
    stop: args.stop,
    stopLevel: levels.stopLevel,
    riskReward: args.riskReward,
    timestampISO,
  });

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
    entryLevel: levels.entryLevel,
    target: args.target,
    targetLevel: levels.targetLevel,
    stop: args.stop,
    stopLevel: levels.stopLevel,
    riskReward: args.riskReward,
    viewLabel: args.viewLabel,
    viewCode: args.viewCode,
    timestamp,
    timestampISO,
    idempotencyKey,
    telegramText,
    telegramParseMode: "HTML",
    useTelegramTextOnly: true,
  };
}
