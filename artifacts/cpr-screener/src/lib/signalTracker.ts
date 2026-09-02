// src/lib/signalTracker.ts

export interface LoggedSignal {
  id: string;
  symbol: string;
  source: "binance" | "delta";
  timeframe: string;
  direction: "LONG" | "SHORT" | "NEUTRAL";
  type: string;
  patternName: string;
  entry: number;
  currentPrice: number;
  target: number;
  sl: number;
  rr: string;
  confidence: "HIGH" | "MEDIUM" | "WATCH";
  cprStatus: string;
  timestamp: number;
  dateStr: string;
  status: "ACTIVE" | "PASS" | "FAIL" | "EXPIRED";
  outcomeNotes?: string;
  evaluatedAt?: number;
  highestPriceSince?: number;
  lowestPriceSince?: number;
  exitPrice?: number;
}

const STORAGE_KEY = "cpr_saved_signals";

function getLocalSignals(): LoggedSignal[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalSignals(list: LoggedSignal[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    console.error("Failed to save signals to localStorage:", err);
  }
}

export async function saveSignalToCloud(
  signal: Omit<LoggedSignal, "id">,
  customId?: string
): Promise<string> {
  const signalId = customId || `${signal.symbol}-${signal.direction}-${Date.now()}`;
  const list = getLocalSignals();
  const existingIdx = list.findIndex((s) => s.id === signalId);
  const data: LoggedSignal = { ...signal, id: signalId };

  if (existingIdx >= 0) {
    list[existingIdx] = { ...list[existingIdx], ...data };
  } else {
    list.unshift(data);
  }
  saveLocalSignals(list);
  return signalId;
}

export async function autoSaveQualifiedSignals(
  signals: Omit<LoggedSignal, "id">[]
): Promise<number> {
  let savedCount = 0;
  const todayKey = new Date().toISOString().slice(0, 10);
  const list = getLocalSignals();

  for (const sig of signals) {
    const patternSlug = sig.patternName.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase();
    const deterministicId = `${sig.symbol}-${sig.direction}-${patternSlug}-${todayKey}`;
    const data: LoggedSignal = {
      ...sig,
      id: deterministicId,
      dateStr: new Date(sig.timestamp).toLocaleString(),
      status: sig.status || "ACTIVE",
      outcomeNotes: `Auto-saved setup (${todayKey}). Awaiting TP (${sig.target}) or SL (${sig.sl}) outcome.`,
    };

    const existingIdx = list.findIndex((s) => s.id === deterministicId);
    if (existingIdx >= 0) {
      list[existingIdx] = { ...list[existingIdx], ...data };
    } else {
      list.unshift(data);
    }
    savedCount++;
  }
  saveLocalSignals(list);
  return savedCount;
}

export async function fetchSavedSignalsFromCloud(): Promise<LoggedSignal[]> {
  return getLocalSignals().sort((a, b) => b.timestamp - a.timestamp);
}

export async function deleteSavedSignalFromCloud(id: string): Promise<void> {
  const list = getLocalSignals().filter((s) => s.id !== id);
  saveLocalSignals(list);
}

export async function clearAllSignalsFromCloud(signalIds: string[]): Promise<void> {
  const idsSet = new Set(signalIds);
  const list = getLocalSignals().filter((s) => !idsSet.has(s.id));
  saveLocalSignals(list);
}

export async function updateSignalOutcomeInCloud(
  id: string,
  update: Partial<LoggedSignal>
): Promise<void> {
  const list = getLocalSignals();
  const idx = list.findIndex((s) => s.id === id);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...update };
    saveLocalSignals(list);
  }
}

export async function evaluateSignalOutcome(
  signal: LoggedSignal
): Promise<Partial<LoggedSignal> | null> {
  if (signal.status !== "ACTIVE") return null;

  try {
    const cleanSymbol = signal.symbol.replace("/", "").replace("-", "").toUpperCase();
    const binanceSymbol = cleanSymbol.endsWith("USDT") ? cleanSymbol : `${cleanSymbol}USDT`;
    const startTime = signal.timestamp;
    const bases = [
      "https://data-api.binance.vision",
      "https://api.binance.com",
      "https://api1.binance.com",
      "https://api3.binance.com",
    ];
    let klines: any[] | null = null;
    for (const base of bases) {
      try {
        const resp = await fetch(
          `${base}/api/v3/klines?symbol=${binanceSymbol}&interval=1h&startTime=${startTime}&limit=100`
        );
        if (resp.ok) {
          const data = await resp.json();
          if (Array.isArray(data) && data.length > 0) {
            klines = data;
            break;
          }
        }
      } catch {
        continue;
      }
    }
    if (!klines) return null;

    let highest = signal.entry;
    let lowest = signal.entry;
    let finalStatus: "ACTIVE" | "PASS" | "FAIL" | "EXPIRED" = "ACTIVE";
    let notes = "Trade active and within parameters";
    let exitPrice = signal.entry;

    const isLong = signal.direction === "LONG";
    const isShort = signal.direction === "SHORT";

    for (const k of klines) {
      const high = parseFloat(k[2]);
      const low = parseFloat(k[3]);

      if (high > highest) highest = high;
      if (low < lowest) lowest = low;

      if (isLong) {
        if (low <= signal.sl) {
          finalStatus = "FAIL";
          exitPrice = signal.sl;
          notes = `Stopped out at ${signal.sl}`;
          break;
        } else if (high >= signal.target) {
          finalStatus = "PASS";
          exitPrice = signal.target;
          notes = `Target achieved at ${signal.target}`;
          break;
        }
      } else if (isShort) {
        if (high >= signal.sl) {
          finalStatus = "FAIL";
          exitPrice = signal.sl;
          notes = `Stopped out at ${signal.sl}`;
          break;
        } else if (low <= signal.target) {
          finalStatus = "PASS";
          exitPrice = signal.target;
          notes = `Target achieved at ${signal.target}`;
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
    console.error("Evaluation error for", signal.symbol, err);
    return null;
  }
}