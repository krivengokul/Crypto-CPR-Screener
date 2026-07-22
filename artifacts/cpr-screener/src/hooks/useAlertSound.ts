import { useEffect, useRef, useState, useCallback } from "react";
import type { CPRResult } from "@/lib/cpr";
import { passesPattern, isRisingAboveTC } from "../ScreenerUtils";

/**
 * Sound-alert logic scoped to the pMini-L34C4/U3>4 sub-filter under
 * "Big Below". Fires a short two-note beep whenever a coin newly crosses
 * above today's TC while the alert is enabled. Mechanical extraction from
 * Screener.tsx — behavior unchanged.
 */
export function usePMiniAlert(
  allResults: CPRResult[],
  deltaAllResults: CPRResult[],
  activePattern: string,
  showBigBelowPMiniPL3: boolean
) {
  const [pMiniAlertsEnabled, setPMiniAlertsEnabled] = useState(false);
  const pMiniRisingAlertedRef = useRef<Set<string>>(new Set());
  const audioCtxRef = useRef<AudioContext | null>(null);

  const playPMiniAlertSound = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtxRef.current = new Ctx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") ctx.resume();
      const now = ctx.currentTime;
      [0, 0.18].forEach((offset) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, now + offset);
        gain.gain.setValueAtTime(0.0001, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.3, now + offset + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + 0.16);
      });
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (!pMiniAlertsEnabled) return;
    if (activePattern !== "structure-bigbelow" || !showBigBelowPMiniPL3) return;

    const binancePMini = allResults
      .filter((r) => passesPattern(r, "bigbelow-pmini-pl3"))
      .map((r) => ({ ...r, source: "binance" as const }));
    const deltaPMini = deltaAllResults
      .filter((r) => passesPattern(r, "bigbelow-pmini-pl3"))
      .map((r) => ({ ...r, source: "delta" as const }));
    const pool = [...binancePMini, ...deltaPMini];

    const currentRisingKeys = new Set(
      pool.filter((r) => isRisingAboveTC(r)).map((r) => `${r.source}-${r.symbol}`)
    );

    let newlyRising = false;
    currentRisingKeys.forEach((key) => {
      if (!pMiniRisingAlertedRef.current.has(key)) {
        pMiniRisingAlertedRef.current.add(key);
        newlyRising = true;
      }
    });
    // Drop symbols that fell back out of Rising/pool so they can re-alert if they cross again later
    pMiniRisingAlertedRef.current.forEach((key) => {
      if (!currentRisingKeys.has(key)) pMiniRisingAlertedRef.current.delete(key);
    });

    if (newlyRising) playPMiniAlertSound();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allResults, deltaAllResults, activePattern, showBigBelowPMiniPL3, pMiniAlertsEnabled]);

  const toggleAlerts = useCallback(() => {
    setPMiniAlertsEnabled((v) => {
      const next = !v;
      if (next) {
        try {
          if (!audioCtxRef.current) {
            const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            audioCtxRef.current = new Ctx();
          }
          audioCtxRef.current.resume();
        } catch { /* silent */ }
        playPMiniAlertSound();
      }
      return next;
    });
  }, [playPMiniAlertSound]);

  const resetAlertedSet = useCallback(() => {
    pMiniRisingAlertedRef.current.clear();
  }, []);

  return { pMiniAlertsEnabled, toggleAlerts, resetAlertedSet };
}
