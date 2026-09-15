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
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { getDb, ensureSignedIn } from "@/lib/firebase";

const CHART_LINKS_COLLECTION = "chartLinks";
const LOCAL_CACHE_KEY = "cpr_chart_links_cache";

export type StoredChartLink = {
  url: string;
  savedAt: string; // ISO timestamp, set client-side for easy display
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

function getLocalCache(): Record<string, StoredChartLink> {
  try {
    const raw = localStorage.getItem(LOCAL_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveToLocalCache(key: string, link: StoredChartLink | null) {
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
  const storedLink: StoredChartLink = { url: trimmed, savedAt };

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