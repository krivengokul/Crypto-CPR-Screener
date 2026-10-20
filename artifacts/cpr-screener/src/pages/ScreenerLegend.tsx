import { Views } from "@/lib/ViewsSidebar";
import { getView, shortLevelLabel } from "@/lib/views";
import {
  ArrowDown,
  ArrowUp,
  Crosshair,
  Flag,
  Hash,
  Shield,
  Tag,
  Target,
} from "lucide-react";

export interface ScreenerLegendProps {
  activeSignal: string;
  /** @deprecated CPR Inside sub-filters removed; kept optional for callers. */
  showInsideCPRTiCOLo?: boolean;
}

/**
 * Card 3 — when a View (or any left-nav leaf) is selected, replace the old
 * hardcoded bias/time copy with a compact trade sheet: name, code, direction,
 * entry / target / stoploss level labels from the View registry.
 */
function SelectedViewTradeCard({ activeSignal }: { activeSignal: string }) {
  const view = activeSignal ? getView(activeSignal) : undefined;
  if (!activeSignal) {
    return (
      <div className="text-[11px] text-muted-foreground">
        Select a View in the left nav to see entry, target, and stoploss.
      </div>
    );
  }

  const name = view?.label || activeSignal;
  const code = view?.key || activeSignal;
  const direction = view?.direction;
  const entryLvl = shortLevelLabel(view?.entryLabel) || view?.entryLabel || "—";
  const targetLvl = shortLevelLabel(view?.targetLabel) || view?.targetLabel || "—";
  const stopLvl = shortLevelLabel(view?.stoplossLabel) || view?.stoplossLabel || "—";
  const isUp = direction === "Up";
  const isDown = direction === "Down";
  const dirColor = isUp
    ? "text-emerald-400"
    : isDown
      ? "text-rose-400"
      : "text-slate-400";

  return (
    <div className="space-y-1.5 min-w-0">
      <div className="flex items-start gap-1.5 min-w-0">
        <Tag className="w-3 h-3 mt-0.5 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-primary leading-tight truncate" title={name}>
            {name}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1 min-w-0">
        <Hash className="w-3 h-3 shrink-0 text-slate-500" aria-hidden />
        <span className="font-mono text-[10px] text-slate-300 truncate" title={code}>
          {code}
        </span>
      </div>
      <div className={`flex items-center gap-1 ${dirColor}`}>
        {isUp ? (
          <ArrowUp className="w-3 h-3 shrink-0" aria-hidden />
        ) : isDown ? (
          <ArrowDown className="w-3 h-3 shrink-0" aria-hidden />
        ) : (
          <Flag className="w-3 h-3 shrink-0 text-slate-500" aria-hidden />
        )}
        <span className="text-[10px] font-semibold uppercase tracking-wide">
          {direction === "Up" ? "Long / Up" : direction === "Down" ? "Short / Down" : "No direction"}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-0.5 pt-0.5 border-t border-border/60">
        <div className="flex items-center gap-1.5 text-[10px]">
          <Crosshair className="w-3 h-3 shrink-0 text-amber-400" aria-hidden />
          <span className="text-slate-500 w-10 shrink-0">Entry</span>
          <span className="font-mono font-semibold text-amber-200">{entryLvl}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px]">
          <Target className="w-3 h-3 shrink-0 text-emerald-400" aria-hidden />
          <span className="text-slate-500 w-10 shrink-0">Target</span>
          <span className="font-mono font-semibold text-emerald-300">{targetLvl}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px]">
          <Shield className="w-3 h-3 shrink-0 text-rose-400" aria-hidden />
          <span className="text-slate-500 w-10 shrink-0">Stop</span>
          <span className="font-mono font-semibold text-rose-300">{stopLvl}</span>
        </div>
      </div>
      {!view?.getEntry && !view?.getTarget && (
        <div className="text-[9px] text-slate-500 pt-0.5">
          Category / filter — no fixed entry levels on this node.
        </div>
      )}
    </div>
  );
}

/**
 * The 3-card legend grid shown above the controls row.
 * Card 1–2: category / pattern overview (unchanged).
 * Card 3: selected View trade sheet (name, code, direction, entry/target/stop).
 */
export default function ScreenerLegend(props: ScreenerLegendProps) {
  const {
    activeSignal,
  } = props;
  
  // Map a sub-pattern id (selected via the sidebar tree, e.g. "A-A-AA-AA-EU3L4-GapB")
  // back to its parent category id (e.g. "overlapping-lower"), so Legend Card 1
  // still shows the parent's overview card instead of going blank when a
  // child pattern is the active one. Parent ids and standalone patterns
  // (which aren't anyone's child) just resolve to themselves.
  function getLegendParentPattern(patternId: string): string {
    for (const [parentId, children] of Object.entries(Views)) {
      if (children.some((c) => c.id === patternId)) return parentId;
    }
    return patternId;
  }
  const legendPattern = getLegendParentPattern(activeSignal);

  return (
     <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
      <div className="rounded-lg border border-border bg-card p-3">
        {/* NEW: label + badges now share the first row (badges shrunk to
            px-1.5 py-0.5 text-[10px]) so more horizontal room is freed
            up. This card is keyed only on activeSignal (never on any
            showXXX subfilter state), so it stays exactly the same
            regardless of which subfilter chip is selected inside a
            section. The old "ADK CPR Formula" fallback for unmatched
            patterns has been removed entirely — unmatched patterns now
            render nothing here. Coverage extended to every category in
            the left nav (pivotcategories array in ViewsSidebar.tsx). */}
        {legendPattern === "overlapping-lower" ? (
          <>
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className="text-xs font-semibold text-primary">Overlapping Below</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-500 text-white">Overlap</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500 text-white">Below</span>
            </div>
            <div className="text-xs text-muted-foreground">Today&apos;s CPR overlaps below yesterday&apos;s CPR</div>
          </>
        ) : legendPattern === "levelsabove" ? (
          <>
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className="text-xs font-semibold text-primary">LEVEL ABOVE</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-500 text-white">Above</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500 text-white">Pivot Level</span>
            </div>
            <div className="text-xs text-muted-foreground">Today&apos;s PH up vs prev PH and PL not down vs prev PL (HHLL-A category)</div>
          </>
        ) : legendPattern === "levelsbelow" ? (
          <>
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className="text-xs font-semibold text-primary">LEVEL BELOW</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-500 text-white">Above</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500 text-white">Pivot Level</span>
            </div>
            <div className="text-xs text-muted-foreground">Today&apos;s PH not up vs prev PH and PL down vs prev PL (HHLL-B category)</div>
          </>
        ) : legendPattern === "compressed" ? (
          <>
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className="text-xs font-semibold text-primary">COMPRESSED</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500 text-white">Compressed</span>
            </div>
            <div className="text-xs text-muted-foreground">HHLL-C only — today&apos;s PH not up and today&apos;s PL up vs yesterday (price range squeezing inward)</div>
          </>
        ) : legendPattern === "expanded" ? (
          <>
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className="text-xs font-semibold text-primary">EXPANDED</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-500 text-white">Expanded</span>
            </div>
            <div className="text-xs text-muted-foreground">HHLL-E only — today&apos;s PH up and today&apos;s PL down vs yesterday (price range widening outward)</div>
          </>
        ) : legendPattern === "inside-cpr" ? (
          <>
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className="text-xs font-semibold text-primary">CPR Inside</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-500 text-white">Inside</span>
            </div>
            <div className="text-xs text-muted-foreground">Today&apos;s CPR sits inside yesterday&apos;s CPR range</div>
          </>
        ) : legendPattern === "equal-cpr" ? (
          <>
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className="text-xs font-semibold text-primary">Equal CPR</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500 text-white">Equal</span>
            </div>
            <div className="text-xs text-muted-foreground">Previous &amp; today&apos;s CPR are effectively equal</div>
          </>
        ) : activeSignal === "R1AbovePR4" ? (
          <>
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className="text-xs font-semibold text-primary">ABOVE LEVEL4</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500 text-white">Above L4</span>
            </div>
            <div className="text-xs text-muted-foreground">Today&apos;s R1 above prev day&apos;s R4 (also excluded from LEVEL ABOVE — a symbol here never appears there)</div>
          </>
        ) : activeSignal === "BPS4" ? (
          <>
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className="text-xs font-semibold text-primary">BELOW LEVEL4</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-destructive text-white">Below L4</span>
            </div>
            <div className="text-xs text-muted-foreground">Today&apos;s S1 below prev day&apos;s S4 (also excluded from LEVEL BELOW — a symbol here never appears there)</div>
          </>
        ) : null}
      </div>
      <div className="rounded-lg border border-border bg-card p-3">
        {activeSignal === "6PM:HHLLA-RRHHGap:6AM" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">RRGap&nbsp;&nbsp;RRHH-AA&nbsp;&nbsp;SSLL-AA&nbsp;&nbsp;HHLL-A&nbsp;&nbsp;HHGap</div>
            <div className="text-xs text-muted-foreground">LEVEL ABOVE, R1 gap larger than S1 gap (RRGap), today&apos;s R1 and PDH both fully above prev&apos;s R1/PDH (RRHH-AA), today&apos;s S1 and PDL both fully above prev&apos;s S1/PDL (SSLL-AA), today&apos;s PDH/PDL both above prev&apos;s (HHLL-A), and today&apos;s PDH gap larger than the PDL gap (HHGap)</div>
          </>
        ) : activeSignal === "7PM:MoMi->U4:2AM" ? (
          <>
            <div className="text-xs font-semibold text-cyan-400 mb-1">Pattern: p-CU1L1 → EU2L4&nbsp;&nbsp;PCPR: pMicro&nbsp;&nbsp;CPR: Mini</div>
            <div className="text-xs text-muted-foreground">LEVEL ABOVE, prev day&apos;s own pattern p-CU1L1, today&apos;s Pattern EU2L4, prev CPR pMicro (≤0.10%), today CPR Mini (0.22%–0.60%), and both previous and current PDL below L1</div>
          </>
        ) : activeSignal === "7PM:MoMi-<L4:2AM" ? (
          <>
            <div className="text-xs font-semibold text-rose-400 mb-1">Pattern: p-CU1L1 → EU2L4&nbsp;&nbsp;PCPR: pMicro&nbsp;&nbsp;CPR: Mini</div>
            <div className="text-xs text-muted-foreground">LEVEL ABOVE, prev day&apos;s own pattern p-CU1L1, today&apos;s Pattern EU2L4, prev CPR pMicro (≤0.10%), today CPR Mini (0.22%–0.60%), both previous and current PDL below L1, and today&apos;s PDL below prev day&apos;s pivot</div>
          </>
        ) : activeSignal === "ss-EL1U4-U4:10PM" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">Pattern: EL1U4&nbsp;&nbsp;PCPR: Wide&nbsp;&nbsp;pBC &gt; U1</div>
            <div className="text-xs text-muted-foreground">BELOW LEVEL4 base — cprFalling + strWideCPR + Prev &amp; Today PDH above their R1 + EL1U4 (Prev R4 in Today R3/R4, Prev S4 in Today BC/S1) + Prev CPR&apos;s BC above Today&apos;s R1</div>
          </>
        ) : activeSignal === "9AM:APHS1A-FAU4:4AM" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">Pattern: EU1L3  PCPR: Small  CPR: Large</div>
            <div className="text-xs text-muted-foreground">Big CPR Above (Wide + Rising) + Today&apos;s R1 &gt; Prev R4 + Pattern EU1L3 + Compression Ratio &gt; 300</div>
          </>
        ) : activeSignal === "6AM:pX-APHS1A-pL4:4AM" ? (
          <>
            <div className="text-xs font-semibold text-red-400 mb-1">Pattern: EUTL3&nbsp;&nbsp;p-EU3L4&nbsp;&nbsp;BC &gt; pPDH&nbsp;&nbsp;S1 &gt; pTC</div>
            <div className="text-xs text-muted-foreground">Big CPR Above (Wide + Rising) + Today&apos;s R1 &gt; Prev R4 + Pattern EUTL3 + Today&apos;s BC above prev day&apos;s own PDH + Today&apos;s S1 above prev day&apos;s TC + prev day&apos;s own pattern p-EU3L4</div>
          </>
        ) : activeSignal === "8AM:APHS1A-FAU4:4AM" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">Pattern: A-A-AA-AA-EU1L3&nbsp;&nbsp;BC &gt; pPDH&nbsp;&nbsp;S1 &gt; pTC</div>
            <div className="text-xs text-muted-foreground">ABOVE LEVEL4 + Pattern A-A-AA-AA-EU1L3 + Today&apos;s BC above prev day&apos;s own PDH + Today&apos;s S1 above prev day&apos;s TC</div>
          </>
        ) : activeSignal === "SMg-exHiL2L1-U4:3AM" ? (
          <>
            <div className="text-xs font-semibold text-sky-400 mb-1">Pattern: EL1L2</div>
            <div className="text-xs text-muted-foreground">Big CPR Above (Wide + Rising) + Today&apos;s R1 &gt; Prev R4 + Pattern EL1L2 (Prev R4 &amp; Prev S4 both inside Today&apos;s S2/S1, Today&apos;s PDL above Prev Pivot)</div>
          </>
        ) : activeSignal === "8AM:CoLApHA-U4+1:8AM" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">
              Pattern: PDL&gt;pS1&nbsp;&nbsp;PDH&gt;pR1 or pPDH&gt;R1
            </div>
            <div className="text-xs text-muted-foreground">
              Inside CPR + today&apos;s PDL above prev day&apos;s S1 (PDL&gt;pS1) + EITHER today&apos;s PDH above prev day&apos;s R1 (PDH&gt;pR1) OR prev day&apos;s PDH above today&apos;s R1 (pPDH&gt;R1).
            </div>
          </>
        ) : activeSignal === "8AM:SRBHHLLA-pU4+1:8AM" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">
              Pattern: CU3L3&nbsp;&nbsp;PCPR: pLarge&nbsp;&nbsp;CPR: Medium
            </div>
            <div className="text-xs text-muted-foreground">
              Inside CPR + CU3L3 + prev CPR pLarge (2.00%–5.00%) + today CPR Medium (1.10%–2.00%) + prev day&apos;s PDL below prev S1 (p-PDL&lt;L1) + today PDH above today R1 (PDH&gt;U1) + prev R1 above today R1 + prev S1 above today S1 + today&apos;s PDH above prev PDH + today&apos;s PDL above prev PDL.
            </div>
          </>
        ) : activeSignal === "2PM:pPDHLA-SRA-U4:7PM" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">
              Pattern: CU4L4&nbsp;&nbsp;PCPR: pLarge&nbsp;&nbsp;CPR: Large
            </div>
            <div className="text-xs text-muted-foreground">
              Inside CPR + CU4L4 + prev CPR pLarge (2.00%–5.00%) + today CPR Large (2.00%–5.00%) + prev day&apos;s PDH above prev R1 (p-PDH&gt;U1) + today PDL below today S1 (PDL&lt;L1) + today R1 above prev R1 + today S1 above prev S1 + prev day&apos;s PDH above today&apos;s PDH + prev day&apos;s PDL above today&apos;s PDL.
            </div>
          </>
        ) : activeSignal === "8AM:pPDHA-SRA-U4+2:2AM" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">
              Pattern: EU4L4&nbsp;&nbsp;SSRR: SSRRAbove
            </div>
            <div className="text-xs text-muted-foreground">
              Inside CPR + EU4L4 (prev R4 inside today&apos;s R3/R4, prev S4 inside today&apos;s S3/S4) + today&apos;s SSRRAbove (today R1 above prev R1, today S1 held at/above prev S1) + prev day&apos;s PDH above today&apos;s PDH + prev day&apos;s PDL above today&apos;s PDL + if today&apos;s PDH is below today&apos;s R1 (PDHLBelow), prev day&apos;s PDH must also be above today&apos;s R1 (p-PDHA).
            </div>
          </>
        ) : activeSignal === "6A:SLE-RRHH:R2-6A" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">RRHH-AA&nbsp;&nbsp;SSLL-E&nbsp;&nbsp;HHLL-A&nbsp;&nbsp;RRGap&nbsp;&nbsp;HHGap&nbsp;&nbsp;pHL-B&nbsp;&nbsp;HLGap-A</div>
            <div className="text-xs text-muted-foreground">Expanded, today&apos;s R1/PDH band fully above prev&apos;s (RRHH-AA), today&apos;s S1/PDL band straddling prev&apos;s (SSLL-E), today&apos;s PDH/PDL both above prev&apos;s (HHLL-A), today&apos;s R1 gap larger than the S1 gap (RRGap), today&apos;s PDH gap larger than the PDL gap (HHGap), prev day&apos;s PDH below prev day&apos;s R1 (pHL-B), and today&apos;s PDH above today&apos;s R1 with today&apos;s HL gap the larger of the two (HLGap-A)</div>
          </>
        ) : activeSignal === "levelsabove" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">LEVEL ABOVE: PH up, PL not down vs prev</div>
            <div className="text-xs text-muted-foreground">Today&apos;s Prev High moved up vs yesterday&apos;s Prev High, and today&apos;s Prev Low did not move down vs yesterday&apos;s Prev Low (HHLL-A)</div>
          </>
        ) : activeSignal === "levelsbelow" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">LEVEL BELOW: PH not up, PL down vs prev</div>
            <div className="text-xs text-muted-foreground">Today&apos;s Prev High did not move up vs yesterday&apos;s Prev High, and today&apos;s Prev Low moved down vs yesterday&apos;s Prev Low (HHLL-B)</div>
          </>
        ) : activeSignal === "2P:L4U4-pLAP:R4-2A" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">Pattern: RHSLB-SSLLpGap&nbsp;&nbsp;L4U4</div>
            <div className="text-xs text-muted-foreground">LEVEL BELOW base, plus the shared RHSLB-SSLLpGap Pattern (RRSS-B + HHLL-B + RRHH-BB + SSLL-BB + SSGap + LLGap + prev day&apos;s PDH/U1 relation HL-A with the gap the wider of the two (pHLGap-A) + today&apos;s PDH/U1 relation HL-B), plus L4U4 (today&apos;s R4 inside prev&apos;s R3/R4 AND prev&apos;s S4 inside today&apos;s S3/S4), plus prev day&apos;s own PDL above today&apos;s Pivot</div>
          </>
        ) : activeSignal === "falling" ? (
          <>
            <div className="text-xs font-semibold mb-1 text-destructive">CPR Falling</div>
            <div className="text-xs text-muted-foreground">Bearish directional bias</div>
          </>
        ) : activeSignal === "inside-value" ? (
          <>
            <div className="text-xs font-semibold mb-1 text-accent">Inside Value CPR</div>
            <div className="text-xs text-muted-foreground">Breakout potential</div>
          </>
        ) : null}
      </div>
      {/* Card 3: selected View — name, code, direction, entry / target / stop */}
      <div className="rounded-lg border border-border bg-card p-3">
        <SelectedViewTradeCard activeSignal={activeSignal} />
      </div>
    </div>
  );
}
