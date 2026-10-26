/**
 * useExchangeScan — Binance / Delta / CoinDCX scan orchestration + caches.
 * Extracted from Screener so scan lifecycle is testable in isolation.
 */
import { useState, useEffect, useRef, useCallback, useMemo, type Dispatch, type SetStateAction } from "react";
import { runScreener } from "@/lib/binance";
import { runDeltaScreener } from "@/lib/delta";
import { runCoinDCXScreener } from "@/lib/coinDCX";
import { COINDCX_ENABLED, DELTA_ENABLED } from "@/lib/featureFlags";
import type { CPRResult } from "@/lib/cpr";
import {
  shouldAutoScanForCache,
  markScannedToday,
  hasScannedToday,
  getLastScanDate,
  getNextScanIST,
  formatCountdown,
  loadCachedResults,
  saveCachedResults,
  isCacheFresh,
  isScanFreshForSource,
  markScannedForSource,
  purgeCoinDCXStorage,
  STORAGE_KEY_BINANCE,
  STORAGE_KEY_DELTA,
  STORAGE_KEY_COINDCX,
} from "@/lib/scheduler";
import { passesPattern } from "@/pages/ScreenerUtils";
import type { ActiveTab } from "@/pages/ScreenerUtils";
import { useBinanceLiveRefresh, useDeltaLiveRefresh, useCoinDCXLiveRefresh } from "@/hooks/useLivePriceRefresh";

export type ScanStatus = "idle" | "scanning" | "done" | "error";

export type ExchangeScanResetters = {
  /** Called when a scan starts or tab changes — clears 15m/upex filter UI state. */
  onScanOrTabReset: () => void;
};

export function useExchangeScan(opts: {
  activeSignal: string;
  scanKey: number;
  activeTab?: ActiveTab;
  onActiveTabChange?: (tab: ActiveTab) => void;
  onScanOrTabReset: () => void;
}) {
  const { activeSignal, scanKey, activeTab: activeTabProp, onActiveTabChange, onScanOrTabReset } = opts;

  const cachedBinance = useMemo(() => loadCachedResults<CPRResult>(STORAGE_KEY_BINANCE), []);
  const cachedDelta = useMemo(
    () => (DELTA_ENABLED ? loadCachedResults<CPRResult>(STORAGE_KEY_DELTA) : null),
    [],
  );
  const cachedCoinDCX = useMemo(
    () => (COINDCX_ENABLED ? loadCachedResults<CPRResult>(STORAGE_KEY_COINDCX) : null),
    [],
  );

  useEffect(() => {
    if (!COINDCX_ENABLED) purgeCoinDCXStorage();
  }, []);

  const [status, setStatus] = useState<ScanStatus>(() =>
    isScanFreshForSource("binance", cachedBinance) ? "done" : "idle",
  );
  const [progress, setProgress] = useState({ done: 0, total: 0, symbol: "" });
  const [allResults, setAllResults] = useState<CPRResult[]>(() =>
    isCacheFresh(cachedBinance) ? cachedBinance?.data ?? [] : [],
  );
  const [filtered, setFiltered] = useState<CPRResult[]>(() =>
    isCacheFresh(cachedBinance) ? cachedBinance?.data ?? [] : [],
  );
  const [binanceScannedAt, setBinanceScannedAt] = useState<number | null>(
    () => (isCacheFresh(cachedBinance) ? cachedBinance?.savedAt ?? null : null),
  );
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState("");
  const [nextScanUtc, setNextScanUtc] = useState<Date>(getNextScanIST());
  const [alreadyScannedToday] = useState(() => hasScannedToday());
  const [lastScanDate] = useState(() => getLastScanDate());

  const [deltaStatus, setDeltaStatus] = useState<ScanStatus>(() =>
    DELTA_ENABLED && isScanFreshForSource("delta", cachedDelta) ? "done" : "idle",
  );
  const [deltaProgress, setDeltaProgress] = useState({ done: 0, total: 0, symbol: "" });
  const [deltaAllResults, setDeltaAllResults] = useState<CPRResult[]>(() =>
    DELTA_ENABLED && isCacheFresh(cachedDelta) ? cachedDelta?.data ?? [] : [],
  );
  const [deltaScannedAt, setDeltaScannedAt] = useState<number | null>(
    () => (DELTA_ENABLED && isCacheFresh(cachedDelta) ? cachedDelta?.savedAt ?? null : null),
  );
  const [deltaFiltered, setDeltaFiltered] = useState<CPRResult[]>(() =>
    DELTA_ENABLED && isCacheFresh(cachedDelta) ? cachedDelta?.data ?? [] : [],
  );
  const [deltaError, setDeltaError] = useState("");

  const [coindcxStatus, setCoinDCXStatus] = useState<ScanStatus>(() =>
    COINDCX_ENABLED && isScanFreshForSource("coindcx", cachedCoinDCX) ? "done" : "idle",
  );
  const [coindcxProgress, setCoinDCXProgress] = useState({ done: 0, total: 0, symbol: "" });
  const [coindcxAllResults, setCoinDCXAllResults] = useState<CPRResult[]>(() =>
    COINDCX_ENABLED && isCacheFresh(cachedCoinDCX) ? cachedCoinDCX?.data ?? [] : [],
  );
  const [coindcxScannedAt, setCoinDCXScannedAt] = useState<number | null>(
    () => (COINDCX_ENABLED && isCacheFresh(cachedCoinDCX) ? cachedCoinDCX?.savedAt ?? null : null),
  );
  const [coindcxFiltered, setCoinDCXFiltered] = useState<CPRResult[]>(() =>
    COINDCX_ENABLED && isCacheFresh(cachedCoinDCX) ? cachedCoinDCX?.data ?? [] : [],
  );
  const [coindcxError, setCoinDCXError] = useState("");

  const [activeTabState, setActiveTabState] = useState<ActiveTab>("binance");
  const activeTab = activeTabProp ?? activeTabState;
  const setActiveTab = onActiveTabChange ?? setActiveTabState;

  useEffect(() => {
    onScanOrTabReset();
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const scanRef = useRef(false);
  const deltaScanRef = useRef(false);
  const coindcxScanRef = useRef(false);
  const allResultsRef = useRef<CPRResult[]>([]);
  const deltaAllResultsRef = useRef<CPRResult[]>([]);
  const coindcxAllResultsRef = useRef<CPRResult[]>([]);
  const activeSignalRef = useRef(activeSignal);
  useEffect(() => {
    activeSignalRef.current = activeSignal;
  }, [activeSignal]);
  useEffect(() => {
    allResultsRef.current = allResults;
  }, [allResults]);
  useEffect(() => {
    deltaAllResultsRef.current = deltaAllResults;
  }, [deltaAllResults]);
  useEffect(() => {
    coindcxAllResultsRef.current = coindcxAllResults;
  }, [coindcxAllResults]);

  const doScan = useCallback(async (switchTab: boolean = true) => {
    if (scanRef.current) return;
    scanRef.current = true;
    onScanOrTabReset();
    setStatus("scanning");
    if (switchTab) setActiveTab("binance");
    setAllResults([]);
    setFiltered([]);
    setError("");
    setProgress({ done: 0, total: 0, symbol: "" });
    try {
      const results = await runScreener((done, total, symbol) => {
        setProgress({ done, total, symbol });
      });
      if (results.length === 0) {
        throw new Error("Binance scan returned no results — will retry on the next scan/refresh.");
      }
      setAllResults(results);
      setFiltered(results.filter((r) => passesPattern(r, activeSignalRef.current)));
      setStatus("done");
      markScannedToday();
      const binanceSaved = saveCachedResults(STORAGE_KEY_BINANCE, results);
      if (binanceSaved) markScannedForSource("binance");
      setBinanceScannedAt(Date.now());
      setNextScanUtc(getNextScanIST());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setStatus("error");
    } finally {
      scanRef.current = false;
    }
  }, [onScanOrTabReset, setActiveTab]);

  const doDeltaScan = useCallback(async (switchTab: boolean = true) => {
    if (!DELTA_ENABLED) return;
    if (deltaScanRef.current) return;
    deltaScanRef.current = true;
    onScanOrTabReset();
    setDeltaStatus("scanning");
    if (switchTab) setActiveTab("delta");
    setDeltaAllResults([]);
    setDeltaFiltered([]);
    setDeltaError("");
    setDeltaProgress({ done: 0, total: 0, symbol: "" });
    try {
      const results = await runDeltaScreener((done, total, symbol) => {
        setDeltaProgress({ done, total, symbol });
      });
      setDeltaAllResults(results);
      setDeltaFiltered(results.filter((r) => passesPattern(r, activeSignalRef.current)));
      setDeltaStatus("done");
      const deltaSaved = saveCachedResults(STORAGE_KEY_DELTA, results);
      if (deltaSaved) markScannedForSource("delta");
      setDeltaScannedAt(Date.now());
    } catch (e) {
      setDeltaError(e instanceof Error ? e.message : "Unknown error");
      setDeltaStatus("error");
    } finally {
      deltaScanRef.current = false;
    }
  }, [onScanOrTabReset, setActiveTab]);

  const doCoinDCXScan = useCallback(async (switchTab: boolean = true) => {
    if (!COINDCX_ENABLED) return;
    if (coindcxScanRef.current) return;
    coindcxScanRef.current = true;
    onScanOrTabReset();
    setCoinDCXStatus("scanning");
    if (switchTab) setActiveTab("coindcx");
    setCoinDCXAllResults([]);
    setCoinDCXFiltered([]);
    setCoinDCXError("");
    setCoinDCXProgress({ done: 0, total: 0, symbol: "" });
    try {
      const results = await runCoinDCXScreener((done, total, symbol) => {
        setCoinDCXProgress({ done, total, symbol });
      });
      setCoinDCXAllResults(results);
      setCoinDCXFiltered(results.filter((r) => passesPattern(r, activeSignalRef.current)));
      setCoinDCXStatus("done");
      const coindcxSaved = saveCachedResults(STORAGE_KEY_COINDCX, results);
      if (coindcxSaved) markScannedForSource("coindcx");
      setCoinDCXScannedAt(Date.now());
    } catch (e) {
      setCoinDCXError(e instanceof Error ? e.message : "Unknown error");
      setCoinDCXStatus("error");
    } finally {
      coindcxScanRef.current = false;
    }
  }, [onScanOrTabReset, setActiveTab]);

  const autoScanRanRef = useRef(false);
  useEffect(() => {
    if (autoScanRanRef.current) return;
    autoScanRanRef.current = true;
    if (shouldAutoScanForCache(cachedBinance, "binance")) void doScan();
    if (DELTA_ENABLED && shouldAutoScanForCache(cachedDelta, "delta")) void doDeltaScan(false);
    if (shouldAutoScanForCache(cachedCoinDCX, "coindcx")) void doCoinDCXScan(false);
  }, [cachedBinance, cachedDelta, cachedCoinDCX, doScan, doDeltaScan, doCoinDCXScan]);

  const isFirstMountRef = useRef(true);
  useEffect(() => {
    if (scanKey > 0) {
      if (isFirstMountRef.current) {
        isFirstMountRef.current = false;
        if (!isScanFreshForSource("binance", cachedBinance)) void doScan();
        if (DELTA_ENABLED && !isScanFreshForSource("delta", cachedDelta)) void doDeltaScan(false);
        if (!isScanFreshForSource("coindcx", cachedCoinDCX)) void doCoinDCXScan(false);
        return;
      }
      doScan();
      if (DELTA_ENABLED) doDeltaScan(false);
      doCoinDCXScan(false);
    }
  }, [scanKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (allResults.length > 0) setFiltered(allResults.filter((r) => passesPattern(r, activeSignal)));
    if (deltaAllResults.length > 0)
      setDeltaFiltered(deltaAllResults.filter((r) => passesPattern(r, activeSignal)));
    if (coindcxAllResults.length > 0)
      setCoinDCXFiltered(coindcxAllResults.filter((r) => passesPattern(r, activeSignal)));
  }, [activeSignal, allResults, deltaAllResults, coindcxAllResults]);

  useBinanceLiveRefresh(status, allResultsRef, setAllResults, setFiltered);
  useDeltaLiveRefresh(deltaStatus, deltaAllResultsRef, setDeltaAllResults, setDeltaFiltered);
  useCoinDCXLiveRefresh(coindcxStatus, coindcxAllResultsRef, setCoinDCXAllResults, setCoinDCXFiltered);

  useEffect(() => {
    const id = setInterval(() => {
      setCountdown(formatCountdown(nextScanUtc));
    }, 1000);
    return () => clearInterval(id);
  }, [nextScanUtc]);

  return {
    activeTab,
    setActiveTab,
    status,
    progress,
    allResults,
    setAllResults,
    filtered,
    setFiltered,
    binanceScannedAt,
    error,
    countdown,
    nextScanUtc,
    alreadyScannedToday,
    lastScanDate,
    deltaStatus,
    deltaProgress,
    deltaAllResults,
    setDeltaAllResults,
    deltaFiltered,
    setDeltaFiltered,
    deltaScannedAt,
    deltaError,
    coindcxStatus,
    coindcxProgress,
    coindcxAllResults,
    setCoinDCXAllResults,
    coindcxFiltered,
    setCoinDCXFiltered,
    coindcxScannedAt,
    coindcxError,
    doScan,
    doDeltaScan,
    doCoinDCXScan,
    allResultsRef,
    deltaAllResultsRef,
    coindcxAllResultsRef,
  };
}
