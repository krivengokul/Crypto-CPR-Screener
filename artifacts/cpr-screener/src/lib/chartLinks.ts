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

function chartLinkDocId(viewKey: string, rowKey: string): string {
  return `${viewKey}::${rowKey}`;
}

/** Read the chart link saved for this View + row, if any. */
export async function getChartLink(viewKey: string, rowKey: string): Promise<StoredChartLink | null> {
  try {
    await ensureSignedIn();
    const snap = await getDoc(doc(getDb(), CHART_LINKS_COLLECTION, chartLinkDocId(viewKey, rowKey)));
    if (!snap.exists()) return null;
    const data = snap.data();
    if (typeof data.url !== "string" || !data.url) return null;
    return { url: data.url, savedAt: typeof data.savedAt === "string" ? data.savedAt : "" };
  } catch {
    return null;
  }
}

/** Save (or overwrite) the chart link for this View + row. Returns false on failure (offline, permission denied) or an empty url. */
export async function setChartLink(viewKey: string, rowKey: string, url: string): Promise<boolean> {
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const uid = await ensureSignedIn();
    const savedAt = new Date().toISOString();
    await setDoc(doc(getDb(), CHART_LINKS_COLLECTION, chartLinkDocId(viewKey, rowKey)), {
      url: trimmed,
      savedAt,
      uid,
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch {
    return false;
  }
}

/** Remove the chart link for this View + row, if one exists. */
export async function removeChartLink(viewKey: string, rowKey: string): Promise<void> {
  try {
    await ensureSignedIn();
    await deleteDoc(doc(getDb(), CHART_LINKS_COLLECTION, chartLinkDocId(viewKey, rowKey)));
  } catch {
    // ignore — nothing to clean up if the delete didn't go through
  }
}