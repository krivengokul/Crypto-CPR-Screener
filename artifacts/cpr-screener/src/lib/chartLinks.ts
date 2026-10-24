/**
 * Chart-link storage — lets you attach a TradingView snapshot URL to a
 * specific View's read of a specific symbol/day, so a link pasted in
 * while looking at one View doesn't silently show up under a different
 * View for the same symbol/day.
 *
 * Backed by Firestore (see lib/firebase.ts — free Spark plan, no linked
 * card needed for this). Scoped per-browser via Anonymous Auth so
 * security rules can restrict a signed-in uid to its own links. Every
 * read/write here is now an async network call, not synchronous
 * localStorage access — see ChartLinkControl in SRLadderPanel.tsx for
 * how the UI accounts for that (loading state, awaited save/clear).
 */

import { useState, useEffect } from "react";
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { getDb, ensureSignedIn } from "@/lib/firebase";

const CHART_LINKS_COLLECTION = "chartLinks";
const LOCAL_CACHE_KEY = "cpr_chart_links_cache";

export type StoredChartLink = {
  url: string;
  savedAt: string; // ISO timestamp, set client-side for easy display
  /** View or category key active when the chart was last saved */
  lastViewKey?: string;
};

export type StoredChartLinkRecord = StoredChartLink & {
  id: string;
  rowKey: string;
  viewKey: string;
};

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeChartLinks(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyChartLinksChanged() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {}
  });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("cpr_chart_links_updated"));
  }
}

export function getLocalCache(): Record<string, StoredChartLink> {
  try {
    const raw = localStorage.getItem(LOCAL_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveToLocalCache(key: string, link: StoredChartLink | null) {
  try {
    const cache = getLocalCache();
    if (link) {
      cache[key] = link;
    } else {
      delete cache[key];
    }
    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore quota/security errors
  }
  notifyChartLinksChanged();
}

/** Get all chart links currently stored in local cache */
export function getAllChartLinks(): Record<string, StoredChartLink> {
  return getLocalCache();
}


const VIEW_KEY_BACKFILL_FLAG = "cpr_chart_links_viewkey_backfill_v1";

/**
 * Recover missing lastViewKey from legacy doc ids (`viewKey::rowKey`) and
 * write them onto the primary symbol-date docs + local cache.
 * Safe to call multiple times; runs at most once per browser until the flag is cleared.
 * Returns how many primary docs were updated.
 */
export async function backfillChartLinkViewKeys(
  options?: { force?: boolean },
): Promise<{ updated: number; skipped: boolean }> {
  const force = options?.force === true;
  if (!force && typeof window !== "undefined") {
    try {
      if (localStorage.getItem(VIEW_KEY_BACKFILL_FLAG) === "1") {
        return { updated: 0, skipped: true };
      }
    } catch {
      // ignore
    }
  }

  let updated = 0;
  try {
    const uid = await ensureSignedIn();
    const db = getDb();
    const snapshot = await getDocs(query(collection(db, CHART_LINKS_COLLECTION), where("uid", "==", uid)));

    // rowKey -> best viewKey found across all docs for that row
    const viewByRow = new Map<string, string>();
    type DocInfo = {
      id: string;
      rowKey: string;
      url: string;
      savedAt: string;
      lastViewKey: string;
      isLegacy: boolean;
    };
    const docs: DocInfo[] = [];

    for (const chartDoc of snapshot.docs) {
      const data = chartDoc.data();
      if (typeof data.url !== "string" || !data.url) continue;

      const legacySeparator = chartDoc.id.lastIndexOf("::");
      const isLegacy = legacySeparator >= 0;
      const legacyViewKey = isLegacy ? chartDoc.id.slice(0, legacySeparator) : "";
      const legacyRowKey = isLegacy ? chartDoc.id.slice(legacySeparator + 2) : chartDoc.id;
      const rowKey = typeof data.rowKey === "string" && data.rowKey ? data.rowKey : legacyRowKey;
      const lastViewKey =
        (typeof data.lastViewKey === "string" && data.lastViewKey) || legacyViewKey || "";

      docs.push({
        id: chartDoc.id,
        rowKey,
        url: data.url,
        savedAt: typeof data.savedAt === "string" ? data.savedAt : "",
        lastViewKey,
        isLegacy,
      });

      if (lastViewKey) {
        const prev = viewByRow.get(rowKey);
        // Prefer non-legacy explicit keys; keep first non-empty
        if (!prev || (isLegacy && !prev)) {
          viewByRow.set(rowKey, lastViewKey);
        } else if (!prev) {
          viewByRow.set(rowKey, lastViewKey);
        }
      }
    }

    // Ensure every row with any view signal is recorded
    for (const d of docs) {
      if (d.lastViewKey && !viewByRow.has(d.rowKey)) {
        viewByRow.set(d.rowKey, d.lastViewKey);
      }
    }

    for (const d of docs) {
      const recovered = viewByRow.get(d.rowKey) || "";
      if (!recovered) continue;
      // Only patch primary (non-legacy) docs that are missing lastViewKey
      if (d.isLegacy) continue;
      if (d.lastViewKey) continue;

      try {
        await setDoc(
          doc(db, CHART_LINKS_COLLECTION, d.id),
          {
            url: d.url,
            savedAt: d.savedAt || new Date().toISOString(),
            uid,
            rowKey: d.rowKey,
            lastViewKey: recovered,
            updatedAt: serverTimestamp(),
            viewKeyBackfilled: true,
          },
          { merge: true }
        );
        saveToLocalCache(d.rowKey, {
          url: d.url,
          savedAt: d.savedAt || new Date().toISOString(),
          lastViewKey: recovered,
        });
        updated += 1;
      } catch {
        // non-blocking per doc
      }
    }

    // Also patch local-only primaries that still lack lastViewKey
    const local = getLocalCache();
    for (const [key, link] of Object.entries(local)) {
      if (!link?.url || key.includes("::")) continue;
      if (link.lastViewKey) continue;
      const recovered = viewByRow.get(key);
      if (!recovered) continue;
      saveToLocalCache(key, {
        url: link.url,
        savedAt: link.savedAt || "",
        lastViewKey: recovered,
      });
      updated += 1;
    }

    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(VIEW_KEY_BACKFILL_FLAG, "1");
      } catch {
        // ignore
      }
    }
  } catch {
    // offline / auth — skip
    return { updated: 0, skipped: true };
  }

  if (updated > 0) notifyChartLinksChanged();
  return { updated, skipped: false };
}

/** Prefer the richer of two records for the same symbol-date row. */
function preferChartRecord(a: StoredChartLinkRecord, b: StoredChartLinkRecord): StoredChartLinkRecord {
  const score = (r: StoredChartLinkRecord) =>
    (r.viewKey ? 4 : 0) + (r.savedAt ? 2 : 0) + (r.id.includes("::") ? 0 : 1);
  let winner = score(b) > score(a) ? b : score(a) > score(b) ? a : a.savedAt >= b.savedAt ? a : b;
  const other = winner === a ? b : a;
  // Keep a non-empty view name if the winner is missing one
  if (!winner.viewKey && other.viewKey) {
    winner = { ...winner, viewKey: other.viewKey };
  }
  if (!winner.savedAt && other.savedAt) {
    winner = { ...winner, savedAt: other.savedAt };
  }
  return winner;
}

/** Collapse primary + legacy docs (and cache duplicates) to one row per symbol-date. */
function dedupeChartRecords(records: StoredChartLinkRecord[]): StoredChartLinkRecord[] {
  const byRow = new Map<string, StoredChartLinkRecord>();
  for (const rec of records) {
    const key = rec.rowKey || rec.id;
    const prev = byRow.get(key);
    byRow.set(key, prev ? preferChartRecord(prev, rec) : rec);
  }
  return Array.from(byRow.values()).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

/** Read every saved chart-link for this browser: Firebase (by uid) + local cache, deduped.
 * Runs a one-time viewKey backfill from legacy `viewKey::rowKey` docs when needed.
 */
export async function getAllChartLinkRecords(): Promise<StoredChartLinkRecord[]> {
  try {
    await backfillChartLinkViewKeys();
  } catch {
    // non-blocking
  }

  const raw: StoredChartLinkRecord[] = [];

  // 1) Local cache
  const local = getLocalCache();
  for (const [key, link] of Object.entries(local)) {
    if (!link?.url) continue;
    const legacySeparator = key.lastIndexOf("::");
    const legacyViewKey = legacySeparator >= 0 ? key.slice(0, legacySeparator) : "";
    const legacyRowKey = legacySeparator >= 0 ? key.slice(legacySeparator + 2) : key;
    const viewKey =
      (typeof link.lastViewKey === "string" && link.lastViewKey) || legacyViewKey || "";
    raw.push({
      id: key,
      url: link.url,
      savedAt: typeof link.savedAt === "string" ? link.savedAt : "",
      rowKey: legacyRowKey,
      viewKey,
    });
  }

  // 2) Firestore for this uid
  try {
    const uid = await ensureSignedIn();
    const db = getDb();
    const snapshot = await getDocs(query(collection(db, CHART_LINKS_COLLECTION), where("uid", "==", uid)));

    for (const chartDoc of snapshot.docs) {
      const data = chartDoc.data();
      if (typeof data.url !== "string" || !data.url) continue;

      const legacySeparator = chartDoc.id.lastIndexOf("::");
      const legacyViewKey = legacySeparator >= 0 ? chartDoc.id.slice(0, legacySeparator) : "";
      const legacyRowKey = legacySeparator >= 0 ? chartDoc.id.slice(legacySeparator + 2) : chartDoc.id;
      const rowKey = typeof data.rowKey === "string" && data.rowKey ? data.rowKey : legacyRowKey;
      const viewKey =
        (typeof data.lastViewKey === "string" && data.lastViewKey) || legacyViewKey || "";

      raw.push({
        id: chartDoc.id,
        url: data.url,
        savedAt: typeof data.savedAt === "string" ? data.savedAt : "",
        rowKey,
        viewKey,
      });
    }
  } catch {
    // offline — local cache only
  }

  return dedupeChartRecords(raw);
}

/** React hook returning live map of chart links, automatically re-rendering when links are added/removed */
export function useChartLinks(): Record<string, StoredChartLink> {
  const [links, setLinks] = useState<Record<string, StoredChartLink>>(() => getLocalCache());

  useEffect(() => {
    const update = () => {
      setLinks(getLocalCache());
    };
    const unsub = subscribeChartLinks(update);
    window.addEventListener("cpr_chart_links_updated", update);
    window.addEventListener("storage", update);

    return () => {
      unsub();
      window.removeEventListener("cpr_chart_links_updated", update);
      window.removeEventListener("storage", update);
    };
  }, []);

  return links;
}

/** Helper to find a stored chart link by rowKey (and legacy viewKey::rowKey fallback) */
export function findChartLink(
  links: Record<string, StoredChartLink>,
  rowKey?: string,
  viewKey?: string
): StoredChartLink | null {
  if (!rowKey && !viewKey) return null;
  const primaryKey = rowKey || viewKey || "";
  if (links[primaryKey]) return links[primaryKey];
  if (viewKey && rowKey && viewKey !== rowKey) {
    const legacyKey = `${viewKey}::${rowKey}`;
    if (links[legacyKey]) return links[legacyKey];
  }
  return null;
}


/** Parse Backtest/Screener rowKey: `source-symbol-YYYY-MM-DD`. */
export function parseChartRowKey(rowKey: string): {
  source?: string;
  symbol?: string;
  entryDate?: string;
} {
  if (!rowKey) return {};
  const m = rowKey.match(/^(binance|delta|coindcx)-(.+)-(\d{4}-\d{2}-\d{2})$/i);
  if (!m) return {};
  return {
    source: m[1].toLowerCase(),
    symbol: m[2],
    entryDate: m[3],
  };
}

export type HistoricalChartLink = StoredChartLinkRecord & {
  entryDate?: string;
  symbol?: string;
  source?: string;
};

function todayUtcISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Build a list of StoredChartLinkRecord from the synchronous local cache only.
 * Used so legend cameras can render before Firestore returns.
 */
export function chartLinkRecordsFromLocalCache(): StoredChartLinkRecord[] {
  const raw: StoredChartLinkRecord[] = [];
  const local = getLocalCache();
  for (const [key, link] of Object.entries(local)) {
    if (!link?.url) continue;
    const legacySeparator = key.lastIndexOf("::");
    const legacyViewKey = legacySeparator >= 0 ? key.slice(0, legacySeparator) : "";
    const legacyRowKey = legacySeparator >= 0 ? key.slice(legacySeparator + 2) : key;
    const viewKey =
      (typeof link.lastViewKey === "string" && link.lastViewKey) || legacyViewKey || "";
    raw.push({
      id: key,
      url: link.url,
      savedAt: typeof link.savedAt === "string" ? link.savedAt : "",
      lastViewKey: link.lastViewKey,
      rowKey: legacyRowKey,
      viewKey,
    });
  }
  return dedupeChartRecords(raw);
}

/**
 * Historical chart snapshots for a View (and optional symbol/source).
 * `viewKey` may be a View key or label — pass aliases via `viewKeys` when known.
 * Prefer past days when excludeToday is true. Sorted newest date first.
 */

/**
 * True when a stored lastViewKey matches this View's aliases.
 * Supports: exact View key/label, parent pattern keys, and Backtest composite
 * paths (`category::pattern::sub`) where any segment is an alias.
 */
export function chartStoredKeyMatchesAliases(
  storedKey: string,
  aliases: Set<string> | string[],
): boolean {
  const sk = (storedKey || "").trim();
  if (!sk) return false;
  const set = aliases instanceof Set ? aliases : new Set(aliases);
  if (set.has(sk)) return true;
  for (const seg of sk.split("::")) {
    if (seg && set.has(seg)) return true;
  }
  return false;
}

export function findHistoricalChartLinks(args: {
  records: StoredChartLinkRecord[];
  /** Primary view id (key or label). */
  viewKey: string;
  /** Optional extra aliases (e.g. key + label) to match stored lastViewKey. */
  viewKeys?: string[];
  symbol?: string;
  source?: string;
  excludeToday?: boolean;
  limit?: number;
}): HistoricalChartLink[] {
  const primary = (args.viewKey || "").trim();
  const aliasSet = new Set<string>();
  if (primary) aliasSet.add(primary);
  for (const k of args.viewKeys || []) {
    const t = (k || "").trim();
    if (t) aliasSet.add(t);
  }
  if (aliasSet.size === 0 || !args.records?.length) return [];

  const sym = args.symbol?.toUpperCase();
  const src = args.source?.toLowerCase();
  const excludeToday = args.excludeToday !== false;
  // Default raised from 3 so Legend Card 2 can show ~1 month of View attachments
  const limit = args.limit ?? 40;
  const today = todayUtcISO();

  const out: HistoricalChartLink[] = [];
  const seenUrl = new Set<string>();

  for (const rec of args.records) {
    if (!rec.url) continue;
    const vk = (rec.viewKey || rec.lastViewKey || "").trim();
    // Match View key/label, or a Backtest pattern path whose segments hit an alias
    // (e.g. levelsbelow::B-B-BB-BB::B-B-BB-BB-EL3U4 for TinyMini-Upmove).
    if (!vk || !chartStoredKeyMatchesAliases(vk, aliasSet)) continue;

    const parsed = parseChartRowKey(rec.rowKey || "");
    const entryDate = parsed.entryDate;
    const recSym = parsed.symbol?.toUpperCase();
    const recSrc = parsed.source?.toLowerCase();

    if (sym && recSym && recSym !== sym) continue;
    if (sym && !recSym) continue;
    if (src && recSrc && recSrc !== src) continue;
    if (excludeToday && entryDate && entryDate === today) continue;

    const dedupe = `${rec.url}|${entryDate || ""}|${recSym || ""}`;
    if (seenUrl.has(dedupe)) continue;
    seenUrl.add(dedupe);

    out.push({
      ...rec,
      entryDate,
      symbol: recSym,
      source: recSrc,
    });
  }

  out.sort((a, b) => {
    const da = a.entryDate || a.savedAt || "";
    const db = b.entryDate || b.savedAt || "";
    return db.localeCompare(da);
  });

  return out.slice(0, limit);
}



/** Preload chart links from Firestore for a list of row keys if not yet in local cache */
export async function preloadChartLinks(keys: string[]): Promise<void> {
  if (!keys || keys.length === 0) return;
  const local = getLocalCache();
  const missing = keys.filter((k) => k && !local[k]);
  if (missing.length === 0) return;

  try {
    await ensureSignedIn();
    const db = getDb();
    let updated = false;
    const cache = { ...local };

    const chunkSize = 8;
    for (let i = 0; i < missing.length; i += chunkSize) {
      const chunk = missing.slice(i, i + chunkSize);
      await Promise.all(
        chunk.map(async (key) => {
          try {
            const snap = await getDoc(doc(db, CHART_LINKS_COLLECTION, key));
            if (snap.exists()) {
              const data = snap.data();
              if (typeof data.url === "string" && data.url) {
                cache[key] = {
                  url: data.url,
                  savedAt: typeof data.savedAt === "string" ? data.savedAt : "",
                };
                updated = true;
              }
            }
          } catch {
            // non-blocking for individual doc
          }
        })
      );
    }

    if (updated) {
      try {
        localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(cache));
      } catch {}
      notifyChartLinksChanged();
    }
  } catch {
    // offline or Firestore non-blocking
  }
}

function chartLinkDocId(_viewKey?: string, rowKey?: string): string {
  // If only one argument is provided or rowKey is given as second arg,
  // document is keyed at the symbol-date level (rowKey).
  const key = rowKey || _viewKey || "";
  return key;
}

/** Read the chart link saved for this symbol-date row.
 * Checks local cache immediately, and synchronizes with Firestore.
 */
export async function getChartLink(viewKey: string, rowKey: string): Promise<StoredChartLink | null> {
  const primaryKey = rowKey || viewKey;
  const legacyKey = viewKey && rowKey && viewKey !== rowKey ? `${viewKey}::${rowKey}` : null;

  // 1. Immediate local cache check
  const localCache = getLocalCache();
  const cached = localCache[primaryKey] || (legacyKey ? localCache[legacyKey] : null);

  // 2. Try Firestore in background/await with fallback
  try {
    await ensureSignedIn();
    const db = getDb();

    // Primary lookup at symbol-date level (${rowKey})
    const snap = await getDoc(doc(db, CHART_LINKS_COLLECTION, primaryKey));
    if (snap.exists()) {
      const data = snap.data();
      if (typeof data.url === "string" && data.url) {
        const result: StoredChartLink = {
          url: data.url,
          savedAt: typeof data.savedAt === "string" ? data.savedAt : "",
          lastViewKey:
            typeof data.lastViewKey === "string" ? data.lastViewKey : viewKey || "",
        };
        saveToLocalCache(primaryKey, result);
        return result;
      }
    }

    // Fallback for legacy viewKey::rowKey docs
    if (legacyKey) {
      const legacySnap = await getDoc(doc(db, CHART_LINKS_COLLECTION, legacyKey));
      if (legacySnap.exists()) {
        const legacyData = legacySnap.data();
        if (typeof legacyData.url === "string" && legacyData.url) {
          const result: StoredChartLink = {
            url: legacyData.url,
            savedAt: typeof legacyData.savedAt === "string" ? legacyData.savedAt : "",
            lastViewKey:
              typeof legacyData.lastViewKey === "string"
                ? legacyData.lastViewKey
                : viewKey || "",
          };
          saveToLocalCache(primaryKey, result);
          return result;
        }
      }
    }

    return cached ?? null;
  } catch {
    // Firestore unavailable or offline — cleanly return local cached link
    return cached ?? null;
  }
}

/** Save (or overwrite) the chart link at the symbol-date level (${rowKey}).
 * Persists locally first for instant feedback, then asynchronously updates Firestore.
 * Returns true if saved locally or in cloud.
 */
export async function setChartLink(viewKey: string, rowKey: string, url: string): Promise<boolean> {
  const trimmed = url.trim();
  if (!trimmed) return false;

  const savedAt = new Date().toISOString();
  const primaryKey = rowKey || viewKey;
  const storedLink: StoredChartLink = {
    url: trimmed,
    savedAt,
    lastViewKey: viewKey || "",
  };

  // Always save to local cache first so user changes are never lost even when offline
  saveToLocalCache(primaryKey, storedLink);

  try {
    const uid = await ensureSignedIn();
    const db = getDb();

    // Save at the symbol-date level (${rowKey})
    await setDoc(doc(db, CHART_LINKS_COLLECTION, primaryKey), {
      url: trimmed,
      savedAt,
      uid,
      rowKey: primaryKey,
      lastViewKey: viewKey || "",
      updatedAt: serverTimestamp(),
    });

    // Also update legacy doc if different, so any legacy readers stay in sync
    if (viewKey && rowKey && viewKey !== rowKey) {
      try {
        await setDoc(doc(db, CHART_LINKS_COLLECTION, `${viewKey}::${rowKey}`), {
          url: trimmed,
          savedAt,
          uid,
          updatedAt: serverTimestamp(),
        });
      } catch {
        // non-blocking
      }
    }

    return true;
  } catch {
    // Firestore sync failed (e.g. offline/network issue) — already saved locally
    return true;
  }
}


/**
 * When a View is renamed (Edit View changes its key), rewrite every chart
 * link that still points at the old key so Stats → Charts shows the new
 * view name instead of the stale key string.
 */
export async function renameChartLinkViewKeys(
  oldViewKey: string,
  newViewKey: string,
): Promise<number> {
  const from = (oldViewKey || "").trim();
  const to = (newViewKey || "").trim();
  if (!from || !to || from === to) return 0;

  let updated = 0;

  // 1) Local cache
  const local = getLocalCache();
  for (const [rowKey, link] of Object.entries(local)) {
    if (!link?.url) continue;
    if (link.lastViewKey === from) {
      saveToLocalCache(rowKey, {
        url: link.url,
        savedAt: link.savedAt || new Date().toISOString(),
        lastViewKey: to,
      });
      updated += 1;
    }
  }

  // 2) Firestore (all docs for this uid whose lastViewKey / legacy id uses old key)
  try {
    const uid = await ensureSignedIn();
    const db = getDb();
    const snapshot = await getDocs(
      query(collection(db, CHART_LINKS_COLLECTION), where("uid", "==", uid)),
    );
    for (const chartDoc of snapshot.docs) {
      const data = chartDoc.data();
      const legacySep = chartDoc.id.lastIndexOf("::");
      const legacyViewKey = legacySep >= 0 ? chartDoc.id.slice(0, legacySep) : "";
      const lastViewKey =
        (typeof data.lastViewKey === "string" && data.lastViewKey) || legacyViewKey || "";
      if (lastViewKey !== from) continue;

      const rowKey =
        (typeof data.rowKey === "string" && data.rowKey) ||
        (legacySep >= 0 ? chartDoc.id.slice(legacySep + 2) : chartDoc.id);
      const url = typeof data.url === "string" ? data.url : "";
      if (!url) continue;
      const savedAt =
        typeof data.savedAt === "string" && data.savedAt
          ? data.savedAt
          : new Date().toISOString();

      try {
        await setDoc(
          chartDoc.ref,
          {
            lastViewKey: to,
            rowKey,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
        // Keep primary symbol-date doc in sync when this was a legacy id
        if (legacySep >= 0 && rowKey) {
          await setDoc(
            doc(db, CHART_LINKS_COLLECTION, rowKey),
            {
              url,
              savedAt,
              uid,
              rowKey,
              lastViewKey: to,
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          );
        }
        saveToLocalCache(rowKey, { url, savedAt, lastViewKey: to });
        updated += 1;
      } catch {
        // non-blocking per doc
      }
    }
  } catch {
    // offline — local cache updates still help this browser
  }

  if (updated > 0) notifyChartLinksChanged();
  return updated;
}

/** Set or fix the view key on an existing chart link (primary rowKey doc + local cache). */
export async function updateChartLinkViewKey(rowKey: string, viewKey: string): Promise<boolean> {
  const key = (rowKey || "").trim();
  const vk = (viewKey || "").trim();
  if (!key || !vk) return false;

  const local = getLocalCache();
  const existing = local[key];
  const url = existing?.url;
  const savedAt = existing?.savedAt || new Date().toISOString();

  // Update local immediately when we already have the URL
  if (url) {
    saveToLocalCache(key, { url, savedAt, lastViewKey: vk });
  }

  try {
    const uid = await ensureSignedIn();
    const db = getDb();
    const ref = doc(db, CHART_LINKS_COLLECTION, key);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      const resolvedUrl = typeof data.url === "string" && data.url ? data.url : url;
      if (!resolvedUrl) return false;
      await setDoc(
        ref,
        {
          url: resolvedUrl,
          savedAt: typeof data.savedAt === "string" && data.savedAt ? data.savedAt : savedAt,
          uid,
          rowKey: key,
          lastViewKey: vk,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      saveToLocalCache(key, {
        url: resolvedUrl,
        savedAt: typeof data.savedAt === "string" && data.savedAt ? data.savedAt : savedAt,
        lastViewKey: vk,
      });
      // Keep a legacy mirror so future backfills see the view
      try {
        await setDoc(doc(db, CHART_LINKS_COLLECTION, `${vk}::${key}`), {
          url: resolvedUrl,
          savedAt: typeof data.savedAt === "string" && data.savedAt ? data.savedAt : savedAt,
          uid,
          lastViewKey: vk,
          updatedAt: serverTimestamp(),
        });
      } catch {
        // non-blocking
      }
      return true;
    }

    // No primary doc — try any legacy *::rowKey
    const snapshot = await getDocs(query(collection(db, CHART_LINKS_COLLECTION), where("uid", "==", uid)));
    let foundUrl = url || "";
    let foundSaved = savedAt;
    for (const d of snapshot.docs) {
      if (!d.id.endsWith(`::${key}`) && d.id !== key) continue;
      const data = d.data();
      if (typeof data.url === "string" && data.url) {
        foundUrl = data.url;
        foundSaved = typeof data.savedAt === "string" ? data.savedAt : foundSaved;
        break;
      }
    }
    if (!foundUrl) return false;

    await setDoc(ref, {
      url: foundUrl,
      savedAt: foundSaved,
      uid,
      rowKey: key,
      lastViewKey: vk,
      updatedAt: serverTimestamp(),
    });
    saveToLocalCache(key, { url: foundUrl, savedAt: foundSaved, lastViewKey: vk });
    return true;
  } catch {
    return !!url; // local-only update counts as success if we had cache
  }
}

/** Remove the chart link for this symbol-date row (and legacy viewKey::rowKey if present). */
export async function removeChartLink(viewKey: string, rowKey: string): Promise<void> {
  const primaryKey = rowKey || viewKey;
  const legacyKey = viewKey && rowKey && viewKey !== rowKey ? `${viewKey}::${rowKey}` : null;

  saveToLocalCache(primaryKey, null);
  if (legacyKey) saveToLocalCache(legacyKey, null);

  try {
    await ensureSignedIn();
    const db = getDb();
    await deleteDoc(doc(db, CHART_LINKS_COLLECTION, primaryKey));

    if (legacyKey) {
      try {
        await deleteDoc(doc(db, CHART_LINKS_COLLECTION, legacyKey));
      } catch {
        // non-blocking
      }
    }
  } catch {
    // non-blocking
  }
}
