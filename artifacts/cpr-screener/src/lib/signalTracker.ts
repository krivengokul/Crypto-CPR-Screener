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
import { evaluateSignalCandles, type SignalOutcomeCandle } from "./signalOutcome";

export interface LoggedSignal {
  id: string;
  symbol: string;
  source: "binance" | "delta" | "coindcx";
  timeframe: string;
  direction: "Up" | "Down" | "NEUTRAL" | "LONG" | "SHORT";
  type: string;
  patternName: string;
  patternId?: string;
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

/**
 * Has this candidate's live price actually reached its entry line yet?
 * Active View / pattern membership only tells you the SETUP matched — it
 * says nothing about whether price has actually crossed the level you'd
 * enter at. Bullish (Up) setups trigger once price reaches or breaks ABOVE
 * their entry line (target is an R-level above, stop is S1 further below);
 * bearish (Down) setups trigger once price reaches or breaks BELOW their
 * entry line (target is an S-level below, stop is R1 further above) — see
 * computeSignalLevels' doc comment in SignalDesk.tsx. Exported so callers
 * (SignalDesk.tsx, App.tsx) can gate on this BEFORE deciding a candidate
 * counts as "submitted today", not just performAutoSave below — otherwise
 * a candidate seen once while still short of entry would get marked
 * submitted and never re-checked for the rest of the day.
 */
export function hasTouchedEntry(
  direction: string,
  entry: number,
  currentPrice: number
): boolean {
  if (direction === "Up") return currentPrice >= entry;
  if (direction === "Down") return currentPrice <= entry;
  // Other direction values (LONG/SHORT/NEUTRAL) carry no BC/TC entry line
  // from computeSignalLevels — nothing defined to gate on here.
  return true;
}

async function performAutoSave(
  signals: Omit<LoggedSignal, "id">[]
): Promise<number> {
  // Belt-and-suspenders: callers are expected to have already filtered on
  // hasTouchedEntry before marking anything "submitted" (see its doc
  // comment), but re-check here too so this function is safe on its own
  // for any future caller that doesn't.
  signals = signals.filter((sig) =>
    hasTouchedEntry(sig.direction, sig.entry, sig.currentPrice)
  );
  if (signals.length === 0) return 0;

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

  const uid = await ensureSignedIn();
  const db = getDb();
  const docRef = doc(db, SIGNALS_COLLECTION, signalDocId(uid, id));
  await deleteDoc(docRef);
}

export async function clearAllSignalsFromCloud(signalIds: string[]): Promise<void> {
  if (!signalIds || signalIds.length === 0) return;

  // 1. Clear from local cache immediately
  const toDelete = new Set(signalIds);
  const remaining = getLocalSignalsCache().filter((s) => !toDelete.has(s.id));
  saveLocalSignalsCache(remaining);

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
interface OutcomeCandle {
  high: number;
  low: number;
}

async function fetchKlinesFast(signal: LoggedSignal): Promise<OutcomeCandle[] | null> {
  if (signal.source === "delta") {
    try {
      const now = Math.floor(Date.now() / 1000);
      const start = Math.floor(signal.timestamp / 1000);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(
        `https://api.india.delta.exchange/v2/history/candles?symbol=${encodeURIComponent(signal.symbol)}&resolution=1h&start=${start}&end=${now}`,
        { signal: controller.signal, cache: "no-store" }
      );
      clearTimeout(timeoutId);
      if (!response.ok) return null;

      const body = await response.json();
      const rows: unknown[] = Array.isArray(body.result)
        ? body.result
        : Array.isArray(body.result?.candles)
          ? body.result.candles
          : Array.isArray(body.candles)
            ? body.candles
            : Array.isArray(body)
              ? body
              : [];
      return rows
        .map((row) => row as { time?: number; high?: number; low?: number })
        .sort((a, b) => Number(a.time) - Number(b.time))
        .map((candle) => ({ high: Number(candle.high), low: Number(candle.low) }))
        .filter((candle) => Number.isFinite(candle.high) && Number.isFinite(candle.low));
    } catch {
      return null;
    }
  }

  const cleanSymbol = signal.symbol.replace(/[\/_\-]/g, "").toUpperCase();
  const binanceSymbol = cleanSymbol.endsWith("USDT") ? cleanSymbol : `${cleanSymbol}USDT`;
  const startTime = signal.timestamp;

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
          return data.map((k) => ({ high: Number(k[2]), low: Number(k[3]) }))
            .filter((candle) => Number.isFinite(candle.high) && Number.isFinite(candle.low));
        }
      }
    } catch {
      continue;
    }
  }
  return null;
}

export async function evaluateSignalOutcome(
  signal: LoggedSignal,
  livePrice?: number
): Promise<Partial<LoggedSignal> | null> {
  if (signal.status !== "ACTIVE") return null;

  try {
    const klines: SignalOutcomeCandle[] = (await fetchKlinesFast(signal)) ?? [];
    // The hourly history can be unavailable (CoinDCX signals are checked
    // against Binance candles, and that request can fail or lag by up to an
    // hour). The exchange's live price is appended as a final zero-range
    // candle so a target/stop the price has ALREADY reached still resolves.
    // Real candles are evaluated first, so an earlier SL-before-TP sequence
    // in the history still wins.
    if (livePrice !== undefined && Number.isFinite(livePrice) && livePrice > 0) {
      klines.push({ high: livePrice, low: livePrice });
    }
    if (klines.length === 0) return null;

    return evaluateSignalCandles(signal, klines);
  } catch (err) {
    console.warn("Evaluation error for", signal.symbol, err);
    return null;
  }
}
