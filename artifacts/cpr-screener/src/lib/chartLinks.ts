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

import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { getDb, ensureSignedIn } from "@/lib/firebase";

const CHART_LINKS_COLLECTION = "chartLinks";

export type StoredChartLink = {
  url: string;
  savedAt: string; // ISO timestamp, set client-side for easy display
};

function chartLinkDocId(_viewKey?: string, rowKey?: string): string {
  // If only one argument is provided or rowKey is given as second arg,
  // document is keyed at the symbol-date level (rowKey).
  const key = rowKey || _viewKey || "";
  return key;
}

/** Read the chart link saved for this symbol-date row.
 * Checks the shared rowKey document first, and falls back to viewKey::rowKey for existing records.
 */
export async function getChartLink(viewKey: string, rowKey: string): Promise<StoredChartLink | null> {
  try {
    await ensureSignedIn();
    const db = getDb();
    const primaryKey = rowKey || viewKey;

    // 1. Primary lookup at symbol-date level (${rowKey})
    const snap = await getDoc(doc(db, CHART_LINKS_COLLECTION, primaryKey));
    if (snap.exists()) {
      const data = snap.data();
      if (typeof data.url === "string" && data.url) {
        return { url: data.url, savedAt: typeof data.savedAt === "string" ? data.savedAt : "" };
      }
    }

    // 2. Backward compatibility fallback for legacy viewKey::rowKey docs
    if (viewKey && rowKey && viewKey !== rowKey) {
      const legacySnap = await getDoc(doc(db, CHART_LINKS_COLLECTION, `${viewKey}::${rowKey}`));
      if (legacySnap.exists()) {
        const legacyData = legacySnap.data();
        if (typeof legacyData.url === "string" && legacyData.url) {
          return { url: legacyData.url, savedAt: typeof legacyData.savedAt === "string" ? legacyData.savedAt : "" };
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

/** Save (or overwrite) the chart link at the symbol-date level (${rowKey}).
 * Also updates the legacy viewKey::rowKey document if applicable for backward compatibility.
 * Returns false on failure (offline, permission denied) or an empty url.
 */
export async function setChartLink(viewKey: string, rowKey: string, url: string): Promise<boolean> {
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const uid = await ensureSignedIn();
    const savedAt = new Date().toISOString();
    const db = getDb();
    const primaryKey = rowKey || viewKey;

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
    return false;
  }
}

/** Remove the chart link for this symbol-date row (and legacy viewKey::rowKey if present). */
export async function removeChartLink(viewKey: string, rowKey: string): Promise<void> {
  try {
    await ensureSignedIn();
    const db = getDb();
    const primaryKey = rowKey || viewKey;
    await deleteDoc(doc(db, CHART_LINKS_COLLECTION, primaryKey));

    if (viewKey && rowKey && viewKey !== rowKey) {
      try {
        await deleteDoc(doc(db, CHART_LINKS_COLLECTION, `${viewKey}::${rowKey}`));
      } catch {
        // non-blocking
      }
    }
  } catch {
    // ignore — nothing to clean up if the delete didn't go through
  }
}