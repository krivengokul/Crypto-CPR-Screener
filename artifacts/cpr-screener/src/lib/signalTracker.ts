// src/lib/signalTracker.ts

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { getDb, ensureSignedIn } from "@/lib/firebase";

export interface LoggedSignal {
  id: string;
  symbol: string;
  source: "binance" | "delta";
  timeframe: string;
  direction: "Up" | "Down" | "NEUTRAL" | "LONG" | "SHORT";
  type: string;
  patternName: string;
  entry: number;
  currentPrice: number;
  target: number;
  sl: number;
  rr: string;
  cprStatus: string;
  timestamp: number;
  dateStr: string;
  status: "ACTIVE" | "PASS" | "FAIL" | "EXPIRED";
  outcomeNotes?: string;
  evaluatedAt?: number;
  highestPriceSince?: number;
  lowestPriceSince?: number;
  exitPrice?: number;
  uid?: string;
}

const SIGNALS_COLLECTION = "signalsJournal";
const SIGNALS_LOCAL_KEY = "cpr_signals_journal_cache";

function signalDocId(uid: string, signalId: string): string {
  return `${uid}::${signalId}`;
}

function getLocalSignalsCache(): LoggedSignal[] {
  try {
    const raw = localStorage.getItem(SIGNALS_LOCAL_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalSignalsCache(signals: LoggedSignal[]) {
  try {
    // Keep the most recent 1000 signals to avoid localStorage quotas
    const sorted = [...signals].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 1000);
    localStorage.setItem(SIGNALS_LOCAL_KEY, JSON.stringify(sorted));
  } catch {
    // ignore
  }
}

function mergeSignals(existing: LoggedSignal[], incoming: LoggedSignal[]): LoggedSignal[] {
  const map = new Map<string, LoggedSignal>();
  for (const s of existing) {
    map.set(s.id, s);
  }
  for (const s of incoming) {
    const prev = map.get(s.id);
    if (!prev) {
      map.set(s.id, s);
    } else {
      // If previous has already completed (PASS/FAIL/EXPIRED), retain its outcome
      if (prev.status === "PASS" || prev.status === "FAIL" || prev.status === "EXPIRED") {
        map.set(s.id, { ...s, ...prev });
      } else {
        map.set(s.id, { ...prev, ...s });
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
}

export async function saveSignalToCloud(
  signal: Omit<LoggedSignal, "id">,
  customId?: string
): Promise<string> {
  const signalId = customId || `${signal.symbol}-${signal.direction}-${Date.now()}`;
  const fullSignal: LoggedSignal = {
    ...signal,
    id: signalId,
  };

  // 1. Immediately cache locally
  const current = getLocalSignalsCache();
  saveLocalSignalsCache(mergeSignals(current, [fullSignal]));

  try {
    const uid = await ensureSignedIn();
    const db = getDb();
    const docRef = doc(db, SIGNALS_COLLECTION, signalDocId(uid, signalId));

    const existingSnap = await getDoc(docRef);
    if (existingSnap.exists()) {
      const existing = existingSnap.data() as LoggedSignal;
      if (existing.status === "PASS" || existing.status === "FAIL" || existing.status === "EXPIRED") {
        return signalId;
      }
    }

    const data: LoggedSignal & { updatedAt: any } = {
      ...fullSignal,
      uid,
      updatedAt: serverTimestamp(),
    };

    await setDoc(docRef, data, { merge: true });
    return signalId;
  } catch {
    // Stored locally; cloud sync will happen when online
    return signalId;
  }
}

async function performAutoSave(
  signals: Omit<LoggedSignal, "id">[]
): Promise<number> {
  const todayKey = new Date().toISOString().slice(0, 10);
  const localList = getLocalSignalsCache();
  const localMap = new Map(localList.map((s) => [s.id, s]));

  const newSignals: LoggedSignal[] = [];
  for (const sig of signals) {
    const patternSlug = sig.patternName.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase();
    const deterministicId = `${sig.symbol}-${sig.direction}-${patternSlug}-${todayKey}`;
    if (!localMap.has(deterministicId)) {
      const fullSig: LoggedSignal = {
        ...sig,
        id: deterministicId,
        dateStr: new Date(sig.timestamp).toLocaleString(),
        status: sig.status || "ACTIVE",
        outcomeNotes: `Auto-saved setup (${todayKey}). Awaiting TP ($${sig.target.toFixed(4)}) or SL ($${sig.sl.toFixed(4)}) outcome.`,
      };
      newSignals.push(fullSig);
      localMap.set(deterministicId, fullSig);
    }
  }

  // Save to local cache first
  if (newSignals.length > 0) {
    saveLocalSignalsCache(Array.from(localMap.values()));
  }

  // Attempt Firestore sync
  try {
    const uid = await ensureSignedIn();
    const db = getDb();

    // Query existing docs for this user
    const q = query(
      collection(db, SIGNALS_COLLECTION),
      where("uid", "==", uid)
    );
    const existingSnap = await getDocs(q);
    const existingIds = new Set<string>();
    existingSnap.forEach((d) => existingIds.add(d.id));

    let savedCount = 0;
    const BATCH_SIZE = 400;

    for (let i = 0; i < signals.length; i += BATCH_SIZE) {
      const chunk = signals.slice(i, i + BATCH_SIZE);
      const batch = writeBatch(db);
      let hasWrites = false;

      for (const sig of chunk) {
        const patternSlug = sig.patternName.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase();
        const deterministicId = `${sig.symbol}-${sig.direction}-${patternSlug}-${todayKey}`;
        const fullDocId = signalDocId(uid, deterministicId);

        if (existingIds.has(fullDocId)) {
          continue;
        }

        const docRef = doc(db, SIGNALS_COLLECTION, fullDocId);
        const data: LoggedSignal & { createdAt: any; updatedAt: any } = {
          ...sig,
          id: deterministicId,
          uid,
          dateStr: new Date(sig.timestamp).toLocaleString(),
          status: sig.status || "ACTIVE",
          outcomeNotes: `Auto-saved setup (${todayKey}). Awaiting TP ($${sig.target.toFixed(4)}) or SL ($${sig.sl.toFixed(4)}) outcome.`,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        batch.set(docRef, data);
        existingIds.add(fullDocId);
        hasWrites = true;
        savedCount++;
      }

      if (hasWrites) {
        await batch.commit();
      }
    }

    return savedCount > 0 ? savedCount : newSignals.length;
  } catch {
    // When offline or Firestore backend unavailable, return locally saved count
    return newSignals.length;
  }
}

/**
 * Smart Auto-Save:
 * Uses deterministic ID per symbol/direction/pattern/day.
 * CRITICAL: If a signal already exists, DO NOT overwrite it or reset its status!
 */
export async function autoSaveQualifiedSignals(
  signals: Omit<LoggedSignal, "id">[]
): Promise<number> {
  if (!signals || signals.length === 0) return 0;

  try {
    return await performAutoSave(signals);
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (msg.includes("closing") || msg.includes("Closing")) {
      try {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("pageshow"));
        }
        await new Promise((r) => setTimeout(r, 600));
        return await performAutoSave(signals);
      } catch {
        return 0;
      }
    }
    return 0;
  }
}

export async function fetchSavedSignalsFromCloud(): Promise<LoggedSignal[]> {
  const localList = getLocalSignalsCache();

  try {
    const uid = await ensureSignedIn();
    const db = getDb();
    const q = query(
      collection(db, SIGNALS_COLLECTION),
      where("uid", "==", uid)
    );
    const snapshot = await getDocs(q);
    const cloudList: LoggedSignal[] = [];

    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as LoggedSignal;
      cloudList.push(data);
    });

    const merged = mergeSignals(localList, cloudList);
    saveLocalSignalsCache(merged);
    return merged;
  } catch {
    // Offline / Firestore unavailable: return local cached signals
    return localList;
  }
}

export async function deleteSavedSignalFromCloud(id: string): Promise<void> {
  // 1. Remove from local cache immediately
  const localList = getLocalSignalsCache().filter((s) => s.id !== id);
  saveLocalSignalsCache(localList);

  try {
    const uid = await ensureSignedIn();
    const db = getDb();
    const docRef = doc(db, SIGNALS_COLLECTION, signalDocId(uid, id));
    await deleteDoc(docRef);
  } catch {
    // non-blocking
  }
}

export async function clearAllSignalsFromCloud(signalIds: string[]): Promise<void> {
  if (!signalIds || signalIds.length === 0) return;

  // 1. Clear from local cache immediately
  const toDelete = new Set(signalIds);
  const remaining = getLocalSignalsCache().filter((s) => !toDelete.has(s.id));
  saveLocalSignalsCache(remaining);

  try {
    const uid = await ensureSignedIn();
    const db = getDb();
    const BATCH_SIZE = 400;

    for (let i = 0; i < signalIds.length; i += BATCH_SIZE) {
      const chunk = signalIds.slice(i, i + BATCH_SIZE);
      const batch = writeBatch(db);
      for (const id of chunk) {
        const docRef = doc(db, SIGNALS_COLLECTION, signalDocId(uid, id));
        batch.delete(docRef);
      }
      await batch.commit();
    }
  } catch {
    // non-blocking
  }
}

export async function updateSignalOutcomeInCloud(
  id: string,
  update: Partial<LoggedSignal>
): Promise<void> {
  // 1. Update local cache immediately
  const localList = getLocalSignalsCache().map((s) => (s.id === id ? { ...s, ...update } : s));
  saveLocalSignalsCache(localList);

  try {
    const uid = await ensureSignedIn();
    const db = getDb();
    const docRef = doc(db, SIGNALS_COLLECTION, signalDocId(uid, id));

    const cleanUpdate: Record<string, any> = { updatedAt: serverTimestamp() };
    for (const [key, val] of Object.entries(update)) {
      if (val !== undefined) {
        cleanUpdate[key] = val;
      }
    }

    await updateDoc(docRef, cleanUpdate);
  } catch {
    // non-blocking
  }
}

/**
 * Fast direct kline fetcher with fast timeout & Futures priority
 */
async function fetchKlinesFast(symbol: string, startTime: number): Promise<any[] | null> {
  const cleanSymbol = symbol.replace(/[\/_\-]/g, "").toUpperCase();
  const binanceSymbol = cleanSymbol.endsWith("USDT") ? cleanSymbol : `${cleanSymbol}USDT`;

  const endpoints = [
    `https://fapi.binance.com/fapi/v1/klines?symbol=${binanceSymbol}&interval=1h&startTime=${startTime}&limit=168`,
    `https://data-api.binance.vision/api/v3/klines?symbol=${binanceSymbol}&interval=1h&startTime=${startTime}&limit=168`,
    `https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=1h&startTime=${startTime}&limit=168`,
  ];

  for (const url of endpoints) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      const resp = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data) && data.length > 0) {
          return data;
        }
      }
    } catch {
      continue;
    }
  }
  return null;
}

export async function evaluateSignalOutcome(
  signal: LoggedSignal
): Promise<Partial<LoggedSignal> | null> {
  if (signal.status !== "ACTIVE") return null;

  try {
    const klines = await fetchKlinesFast(signal.symbol, signal.timestamp);
    if (!klines || klines.length === 0) return null;

    let highest = signal.entry;
    let lowest = signal.entry;
    let finalStatus: "ACTIVE" | "PASS" | "FAIL" | "EXPIRED" = "ACTIVE";
    let notes = "Trade active and within parameters";
    let exitPrice = signal.entry;

    const isUp = signal.direction === "Up" || signal.direction === "LONG";
    const isDown = signal.direction === "Down" || signal.direction === "SHORT";

    for (const k of klines) {
      const high = parseFloat(k[2]);
      const low = parseFloat(k[3]);

      if (high > highest) highest = high;
      if (low < lowest) lowest = low;

      if (isUp) {
        if (low <= signal.sl) {
          finalStatus = "FAIL";
          exitPrice = signal.sl;
          notes = `Stopped out at $${signal.sl.toFixed(4)}`;
          break;
        } else if (high >= signal.target) {
          finalStatus = "PASS";
          exitPrice = signal.target;
          notes = `Target achieved at $${signal.target.toFixed(4)}`;
          break;
        }
      } else if (isDown) {
        if (high >= signal.sl) {
          finalStatus = "FAIL";
          exitPrice = signal.sl;
          notes = `Stopped out at $${signal.sl.toFixed(4)}`;
          break;
        } else if (low <= signal.target) {
          finalStatus = "PASS";
          exitPrice = signal.target;
          notes = `Target achieved at $${signal.target.toFixed(4)}`;
          break;
        }
      }
    }

    const now = Date.now();
    if (finalStatus === "ACTIVE" && now - signal.timestamp > 7 * 24 * 60 * 60 * 1000) {
      finalStatus = "EXPIRED";
      notes = "Session expired after 7 days without triggering SL or TP";
    }

    return {
      status: finalStatus,
      highestPriceSince: highest,
      lowestPriceSince: lowest,
      outcomeNotes: notes,
      evaluatedAt: Date.now(),
      exitPrice: finalStatus !== "ACTIVE" ? exitPrice : undefined,
    };
  } catch (err) {
    console.warn("Evaluation error for", signal.symbol, err);
    return null;
  }
}