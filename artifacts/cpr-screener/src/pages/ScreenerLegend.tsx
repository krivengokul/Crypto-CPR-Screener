import { Views } from "@/lib/ViewsSidebar"

export interface ScreenerLegendProps {
  activeView: string;
  showExpU4PU4: boolean;
  showExpU3PU3: boolean;
  showOBLoRRHHLLA: boolean;
  showOBNLoL4U4: boolean;
  showOBWLoL4U4: boolean;
  /** @deprecated CPR Inside sub-filters removed; kept optional for callers. */
  showInsideCPRTiCOLo?: boolean;
}

/**
 * The 3-card legend grid shown above the controls row. Mechanical
 * extraction of the "{/* Legend *}" block from Screener.tsx — same
 * conditions, same copy, same styling. Takes every boolean the original
 * ternary chain read as a prop.
 */
export default function ScreenerLegend(props: ScreenerLegendProps) {
  const {
    activeView,
    showExpU4PU4,
    showExpU3PU3,
    showOBLoRRHHLLA,
    showOBNLoL4U4,
    showOBWLoL4U4,
  } = props;
  
  // Map a sub-pattern id (selected via the sidebar tree, e.g. "eXLo-L4U4-U4")
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
  const legendPattern = getLegendParentPattern(activeView);

  return (
     <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
      <div className="rounded-lg border border-border bg-card p-3">
        {/* NEW: label + badges now share the first row (badges shrunk to
            px-1.5 py-0.5 text-[10px]) so more horizontal room is freed
            up. This card is keyed only on activeView (never on any
            showXXX subfilter state), so it stays exactly the same
            regardless of which subfilter chip is selected inside a
            section. The old "ADK CPR Formula" fallback for unmatched
            patterns has been removed entirely — unmatched patterns now
            render nothing here. Coverage extended to every category in
            the left nav (pivotcategories array in ViewsSidebar.tsx). */}
        {legendPattern === "overlapping-lower" ? (
          <>
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className="text-xs font-semibold text-primary">Overlapping Lower</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-500 text-white">Overlap</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500 text-white">Lower</span>
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
            <div className="text-xs text-muted-foreground">Today&apos;s TC sits between prev R1 and R2, and today&apos;s S1 sits between prev BC and R1</div>
          </>
        ) : legendPattern === "levelsbelow" ? (
          <>
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className="text-xs font-semibold text-primary">LEVEL BELOW</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-500 text-white">Above</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500 text-white">Pivot Level</span>
            </div>
            <div className="text-xs text-muted-foreground">Yesterday&apos;s Pivot sits between today&apos;s R1 and R2, and today&apos;s BC sits between yesterday&apos;s S1 and BC</div>
          </>
        ) : legendPattern === "compressed" ? (
          <>
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className="text-xs font-semibold text-primary">COMPRESSED</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500 text-white">Compressed</span>
            </div>
            <div className="text-xs text-muted-foreground">RRSS-C only — today&apos;s R1 down and today&apos;s S1 up vs yesterday (levels squeezing inward)</div>
          </>
        ) : legendPattern === "expanded" ? (
          <>
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className="text-xs font-semibold text-primary">EXPANDED</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-500 text-white">Expanded</span>
            </div>
            <div className="text-xs text-muted-foreground">RRSS-E only — today&apos;s R1 up and today&apos;s S1 down vs yesterday (levels widening outward)</div>
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
        ) : activeView === "R1AbovePR4" ? (
          <>
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className="text-xs font-semibold text-primary">ABOVE LEVEL4</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500 text-white">Above L4</span>
            </div>
            <div className="text-xs text-muted-foreground">Today&apos;s R1 above prev day&apos;s R4 (also excluded from LEVEL ABOVE — a symbol here never appears there)</div>
          </>
        ) : activeView === "S1BelowPS4" ? (
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
        {activeView === "6PM:HHLLA-RRHHGap:6AM" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">RRGap&nbsp;&nbsp;RRHH-AA&nbsp;&nbsp;SSLL-AA&nbsp;&nbsp;HHLL-A&nbsp;&nbsp;HHGap</div>
            <div className="text-xs text-muted-foreground">LEVEL ABOVE, R1 gap larger than S1 gap (RRGap), today&apos;s R1 and PDH both fully above prev&apos;s R1/PDH (RRHH-AA), today&apos;s S1 and PDL both fully above prev&apos;s S1/PDL (SSLL-AA), today&apos;s PDH/PDL both above prev&apos;s (HHLL-A), and today&apos;s PDH gap larger than the PDL gap (HHGap)</div>
          </>
        ) : activeView === "7PM:MoMi->U4:2AM" ? (
          <>
            <div className="text-xs font-semibold text-cyan-400 mb-1">Pattern: p-CU1L1 → EU2L4&nbsp;&nbsp;PCPR: pMicro&nbsp;&nbsp;CPR: Mini</div>
            <div className="text-xs text-muted-foreground">LEVEL ABOVE, prev day&apos;s own pattern p-CU1L1, today&apos;s Pattern EU2L4, prev CPR pMicro (≤0.10%), today CPR Mini (0.22%–0.60%), and both previous and current PDL below L1</div>
          </>
        ) : activeView === "7PM:MoMi-<L4:2AM" ? (
          <>
            <div className="text-xs font-semibold text-rose-400 mb-1">Pattern: p-CU1L1 → EU2L4&nbsp;&nbsp;PCPR: pMicro&nbsp;&nbsp;CPR: Mini</div>
            <div className="text-xs text-muted-foreground">LEVEL ABOVE, prev day&apos;s own pattern p-CU1L1, today&apos;s Pattern EU2L4, prev CPR pMicro (≤0.10%), today CPR Mini (0.22%–0.60%), both previous and current PDL below L1, and today&apos;s PDL below prev day&apos;s pivot</div>
          </>
        ) : activeView === "6PM:APHS1A-FAU4:9PM" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">Pattern: EU2L4&nbsp;&nbsp;Prev: p-EU3L4&nbsp;&nbsp;BC &gt; pPDH&nbsp;&nbsp;S1 &gt; pTC</div>
            <div className="text-xs text-muted-foreground">LEVEL ABOVE + Pattern EU2L4 + prev day&apos;s own pattern p-EU3L4 + today&apos;s BC above prev day&apos;s own PDH + today&apos;s S1 above prev day&apos;s TC</div>
          </>
        ) : activeView === "9AM:pPALPApH-FAU4:2PM" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">Pattern: U4L3&nbsp;&nbsp;pPivot &gt; PDL&nbsp;&nbsp;Pivot &gt; PDH</div>
            <div className="text-xs text-muted-foreground">LEVEL ABOVE + Pattern U4L3 (today&apos;s S4 in prev&apos;s S3/S2 band, prev&apos;s R4 in today&apos;s R3/R4 band) + prev day&apos;s own Pivot above today&apos;s PDL + today&apos;s own Pivot above today&apos;s PDH</div>
          </>
        ) : activeView === "ss-EL1U4-U4:10PM" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">Pattern: EL1U4&nbsp;&nbsp;PCPR: Wide&nbsp;&nbsp;pBC &gt; U1</div>
            <div className="text-xs text-muted-foreground">BELOW LEVEL4 base — cprFalling + strWideCPR + Prev &amp; Today PDH above their R1 + EL1U4 (Prev R4 in Today R3/R4, Prev S4 in Today BC/S1) + Prev CPR&apos;s BC above Today&apos;s R1</div>
          </>
        ) : activeView === "9AM:APHS1A-FAU4:4AM" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">Pattern: EU1L3  PCPR: Small  CPR: Large</div>
            <div className="text-xs text-muted-foreground">Big CPR Above (Wide + Rising) + Today&apos;s R1 &gt; Prev R4 + Pattern EU1L3 + Compression Ratio &gt; 300</div>
          </>
        ) : activeView === "6AM:pX-APHS1A-pL4:4AM" ? (
          <>
            <div className="text-xs font-semibold text-red-400 mb-1">Pattern: EUTL3&nbsp;&nbsp;p-EU3L4&nbsp;&nbsp;BC &gt; pPDH&nbsp;&nbsp;S1 &gt; pTC</div>
            <div className="text-xs text-muted-foreground">Big CPR Above (Wide + Rising) + Today&apos;s R1 &gt; Prev R4 + Pattern EUTL3 + Today&apos;s BC above prev day&apos;s own PDH + Today&apos;s S1 above prev day&apos;s TC + prev day&apos;s own pattern p-EU3L4</div>
          </>
        ) : activeView === "8AM:APHS1A-FAU4:4AM" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">Pattern: EU1L3&nbsp;&nbsp;BC &gt; pPDH&nbsp;&nbsp;S1 &gt; pTC</div>
            <div className="text-xs text-muted-foreground">Big CPR Above (Wide + Rising) + Today&apos;s R1 &gt; Prev R4 + Pattern EU1L3 + Today&apos;s BC above prev day&apos;s own PDH + Today&apos;s S1 above prev day&apos;s TC</div>
          </>
        ) : activeView === "SMg-exHiL2L1-U4:3AM" ? (
          <>
            <div className="text-xs font-semibold text-sky-400 mb-1">Pattern: EL1L2</div>
            <div className="text-xs text-muted-foreground">Big CPR Above (Wide + Rising) + Today&apos;s R1 &gt; Prev R4 + Pattern EL1L2 (Prev R4 &amp; Prev S4 both inside Today&apos;s S2/S1, Today&apos;s PDL above Prev Pivot)</div>
          </>
        ) : activeView === "6AM:MegMeg-L3:8PM" ? (
          <>
            <div className="text-xs font-semibold text-red-400 mb-1">Pattern: EU1L4  PCPR: Mega  CPR: Mega</div>
            <div className="text-xs text-muted-foreground">Big CPR Above (Wide + Rising) + Today&apos;s R1 &gt; Prev R4 + Pattern EU1L4 + Prev CPR width 5.00%–10.00% (pMega), Today CPR width 5.00%–10.00% (Mega)</div>
          </>
        ) : activeView === "TiMe-EUTL3-AU4:2PM" ? (
          <>
            <div className="text-xs font-semibold text-violet-400 mb-1">Pattern: EUTL3  PCPR: Tiny  CPR: Mega</div>
            <div className="text-xs text-muted-foreground">Big CPR Above (Wide + Rising) + Today&apos;s R1 &gt; Prev R4 + Pattern EUTL3 (Prev S4 inside Today&apos;s S2/S3, Prev R4 inside Today&apos;s Pivot/TC) + Prev CPR width 0.10%–0.22% (Tiny), Today CPR width 5.00%–10.00% (Mega)</div>
          </>
        ) : showExpU4PU4 && activeView === "overlapping-lower" ? (
          <>
            <div className="text-xs font-semibold text-sky-400 mb-1">Expanded</div>
            <div className="text-xs text-muted-foreground">Prev R4 between today&apos;s R3/R4 and Prev S4 between today&apos;s S3/S4 with today&apos;s CPR Mini</div>
          </>
        ) : showExpU3PU3 && activeView === "overlapping-lower" ? (
          <>
            <div className="text-xs font-semibold text-sky-400 mb-1">Expanded</div>
            <div className="text-xs text-muted-foreground">Todays U3 &gt; Prev U4/Todays L3 &lt; Prev L4 , today&apos;s CPR is Narrow</div>
          </>
        ) : showOBLoRRHHLLA && activeView === "overlapping-lower" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">
              Pattern: HHRRBelow&nbsp;&nbsp;HHLLAbove
            </div>
            <div className="text-xs text-muted-foreground">
              Overlap Below + HHRRBelow (today&apos;s R1 AND today&apos;s PDH both below the lower of prev day&apos;s R1/PDH) + HHLLAbove (today&apos;s PDH strictly above prev day&apos;s PDH AND today&apos;s PDL &gt;= prev day&apos;s PDL).
            </div>
          </>
        ) : showOBNLoL4U4 && activeView === "overlapping-lower" ? (
          <>
            <div className="text-xs font-semibold text-cyan-400 mb-1">Overlap Lower, Narrow</div>
            <div className="text-xs text-muted-foreground">Today&apos;s R4 inside Prev R3/R4, Prev S4 inside Today&apos;s S3/S4, today&apos;s CPR Narrow, Compression &gt; 50%</div>
          </>
        ) : showOBWLoL4U4 && activeView === "overlapping-lower" ? (
          <>
            <div className="text-xs font-semibold text-rose-400 mb-1">Overlap Lower, Wide</div>
            <div className="text-xs text-muted-foreground">Today&apos;s R4 inside Prev R3/R4, Prev S4 inside Today&apos;s S3/S4, today&apos;s CPR Wide, Compression &gt; 50%</div>
          </>
        ) : activeView === "2PM:SSLLpRRHHA-ApU4:5PM" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">
              Pattern: SSLLAbove&nbsp;&nbsp;HHRRBelow
            </div>
            <div className="text-xs text-muted-foreground">
              Overlap Below + SSLLAbove (today&apos;s S1 AND today&apos;s PDL both above the higher of prev day&apos;s S1/PDL) + HHRRBelow (today&apos;s R1 AND today&apos;s PDH both below the lower of prev day&apos;s R1/PDH) + EITHER prev day&apos;s R1 above today&apos;s R2 OR today&apos;s S3 above prev day&apos;s S2.
            </div>
          </>
        ) : activeView === "8AM:SSLLpRRHHA-L4:1PM" ? (
          <>
            <div className="text-xs font-semibold text-red-400 mb-1">
              Pattern: SSLLAbove&nbsp;&nbsp;HHRRBelow
            </div>
            <div className="text-xs text-muted-foreground">
              Overlap Below + SSLLAbove (today&apos;s S1 AND today&apos;s PDL both above the higher of prev day&apos;s S1/PDL) + HHRRBelow (today&apos;s R1 AND today&apos;s PDH both below the lower of prev day&apos;s R1/PDH) + EITHER prev day&apos;s R1 below today&apos;s R2 OR today&apos;s S3 below prev day&apos;s S2. Bearish sibling of 2PM:SSLLpRRHHA-ApU4:5PM, targets today&apos;s own L4/S4 by ~1PM.
            </div>
          </>
        ) : activeView === "8AM:CoLApHA-U4+1:8AM" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">
              Pattern: PDL&gt;pS1&nbsp;&nbsp;PDH&gt;pR1 or pPDH&gt;R1
            </div>
            <div className="text-xs text-muted-foreground">
              Inside CPR + today&apos;s PDL above prev day&apos;s S1 (PDL&gt;pS1) + EITHER today&apos;s PDH above prev day&apos;s R1 (PDH&gt;pR1) OR prev day&apos;s PDH above today&apos;s R1 (pPDH&gt;R1).
            </div>
          </>
        ) : activeView === "8AM:SRBHHLLA-pU4+1:8AM" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">
              Pattern: CU3L3&nbsp;&nbsp;PCPR: pLarge&nbsp;&nbsp;CPR: Medium
            </div>
            <div className="text-xs text-muted-foreground">
              Inside CPR + CU3L3 + prev CPR pLarge (2.00%–5.00%) + today CPR Medium (1.10%–2.00%) + prev day&apos;s PDL below prev S1 (p-PDL&lt;L1) + today PDH above today R1 (PDH&gt;U1) + prev R1 above today R1 + prev S1 above today S1 + today&apos;s PDH above prev PDH + today&apos;s PDL above prev PDL.
            </div>
          </>
        ) : activeView === "2PM:pPDHLA-SRA-U4:7PM" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">
              Pattern: CU4L4&nbsp;&nbsp;PCPR: pLarge&nbsp;&nbsp;CPR: Large
            </div>
            <div className="text-xs text-muted-foreground">
              Inside CPR + CU4L4 + prev CPR pLarge (2.00%–5.00%) + today CPR Large (2.00%–5.00%) + prev day&apos;s PDH above prev R1 (p-PDH&gt;U1) + today PDL below today S1 (PDL&lt;L1) + today R1 above prev R1 + today S1 above prev S1 + prev day&apos;s PDH above today&apos;s PDH + prev day&apos;s PDL above today&apos;s PDL.
            </div>
          </>
        ) : activeView === "8AM:pPDHA-SRA-U4+2:2AM" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">
              Pattern: EU4L4&nbsp;&nbsp;SSRR: SSRRAbove
            </div>
            <div className="text-xs text-muted-foreground">
              Inside CPR + EU4L4 (prev R4 inside today&apos;s R3/R4, prev S4 inside today&apos;s S3/S4) + today&apos;s SSRRAbove (today R1 above prev R1, today S1 held at/above prev S1) + prev day&apos;s PDH above today&apos;s PDH + prev day&apos;s PDL above today&apos;s PDL + if today&apos;s PDH is below today&apos;s R1 (PDHLBelow), prev day&apos;s PDH must also be above today&apos;s R1 (p-PDHA).
            </div>
          </>
        ) : activeView === "6A:SLE-RRHH:R2-6A" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">RRHH-AA&nbsp;&nbsp;SSLL-E&nbsp;&nbsp;HHLL-A&nbsp;&nbsp;RRGap&nbsp;&nbsp;HHGap&nbsp;&nbsp;pHL-B&nbsp;&nbsp;HLGap-A</div>
            <div className="text-xs text-muted-foreground">Expanded, today&apos;s R1/PDH band fully above prev&apos;s (RRHH-AA), today&apos;s S1/PDL band straddling prev&apos;s (SSLL-E), today&apos;s PDH/PDL both above prev&apos;s (HHLL-A), today&apos;s R1 gap larger than the S1 gap (RRGap), today&apos;s PDH gap larger than the PDL gap (HHGap), prev day&apos;s PDH below prev day&apos;s R1 (pHL-B), and today&apos;s PDH above today&apos;s R1 with today&apos;s HL gap the larger of the two (HLGap-A)</div>
          </>
        ) : activeView === "levelsabove" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">Pivot Level: CPR in prev U2 band</div>
            <div className="text-xs text-muted-foreground">Today TC &gt; prev R1 &amp; &lt; prev R2 — today S1 &gt; prev BC &amp; &lt; prev R1</div>
          </>
        ) : activeView === "levelsbelow" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">Pivot Level: pCPR in U1 band</div>
            <div className="text-xs text-muted-foreground">Prev Pivot &gt; today R1 &amp; &lt; today R2 — today BC &gt; prev S1 &amp; &lt; prev BC</div>
          </>
        ) : activeView === "3P:HA-pBELOWR1:R2-3A" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">RRHH-HA&nbsp;&nbsp;SSLL-BB&nbsp;&nbsp;HHLL-E&nbsp;&nbsp;SSGap&nbsp;&nbsp;LLGap&nbsp;&nbsp;pHL-B&nbsp;&nbsp;HLGap-A</div>
            <div className="text-xs text-muted-foreground">LEVEL BELOW base, today&apos;s R1/PDH band mixed vs prev&apos;s (RRHH-HA), today&apos;s S1/PDL band fully below prev&apos;s (SSLL-BB), today&apos;s PDH/PDL range widened on both sides (HHLL-E), today&apos;s S1 gap larger than the R1 gap (SSGap), today&apos;s PDL gap larger than the PDH gap (LLGap), prev day&apos;s PDH/U1 relation is HL-B (pHL-B), today&apos;s PDH/U1 relation is HL-A with today&apos;s HL gap the wider of the two (HLGap-A), prev day&apos;s S3 above today&apos;s S1, and prev day&apos;s own Pivot above today&apos;s R1</div>
          </>
        ) : activeView === "3P:HA-pABOVER1:S2-6P" ? (
          <>
            <div className="text-xs font-semibold text-rose-400 mb-1">RRHH-HA&nbsp;&nbsp;SSLL-BB&nbsp;&nbsp;HHLL-E&nbsp;&nbsp;SSGap&nbsp;&nbsp;LLGap&nbsp;&nbsp;pHL-B&nbsp;&nbsp;HLGap-A</div>
            <div className="text-xs text-muted-foreground">LEVEL BELOW base, today&apos;s R1/PDH band mixed vs prev&apos;s (RRHH-HA), today&apos;s S1/PDL band fully below prev&apos;s (SSLL-BB), today&apos;s PDH/PDL range widened on both sides (HHLL-E), today&apos;s S1 gap larger than the R1 gap (SSGap), today&apos;s PDL gap larger than the PDH gap (LLGap), prev day&apos;s PDH/U1 relation is HL-B (pHL-B), today&apos;s PDH/U1 relation is HL-A with today&apos;s HL gap the wider of the two (HLGap-A), prev day&apos;s S3 above today&apos;s S1, and prev day&apos;s own Pivot below today&apos;s R1</div>
          </>
        ) : activeView === "2P:HA-HABOVEpR1:R4-4P" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">RRHH-HA&nbsp;&nbsp;SSLL-BB&nbsp;&nbsp;HHLL-E&nbsp;&nbsp;SSGap&nbsp;&nbsp;LLGap&nbsp;&nbsp;pHL-B&nbsp;&nbsp;HLGap-A</div>
            <div className="text-xs text-muted-foreground">LEVEL BELOW base, today&apos;s R1/PDH band mixed vs prev&apos;s (RRHH-HA), today&apos;s S1/PDL band fully below prev&apos;s (SSLL-BB), today&apos;s PDH/PDL range widened on both sides (HHLL-E), today&apos;s S1 gap larger than the R1 gap (SSGap), today&apos;s PDL gap larger than the PDH gap (LLGap), prev day&apos;s PDH/U1 relation is HL-B (pHL-B), today&apos;s PDH/U1 relation is HL-A with today&apos;s HL gap the wider of the two (HLGap-A), prev day&apos;s S3 above today&apos;s S1, today&apos;s own R1 above prev day&apos;s PDH, today&apos;s own Pivot above prev day&apos;s PDL, and today&apos;s R3 above prev day&apos;s R4</div>
          </>
        ) : activeView === "PDH>pTC-U4:5AM" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">Pivot Level: pCPR in U1 band</div>
            <div className="text-xs text-muted-foreground">LEVEL BELOW base, plus today&apos;s PDH above prev day&apos;s TC, plus (pMini &amp; today Small) or (pSmall &amp; today Large)</div>
          </>
        ) : activeView === "11AM:pCPR1AHi-FApU4:1PM" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">Pattern: L4U3&nbsp;&nbsp;PDH/PDL: HHLLBelow&nbsp;&nbsp;p-PDHL-B / PDHL-A</div>
            <div className="text-xs text-muted-foreground">LEVEL BELOW base, plus L4U3 (today&apos;s R4 in prev R2/R3 band), today&apos;s PDH at/below prev PDH and today&apos;s PDL below prev PDL, prev day&apos;s own PDH below prev day&apos;s R1 (p-PDHL-B), today&apos;s PDH above today&apos;s R1 (PDHL-A), and today&apos;s R1 at/above prev day&apos;s BC</div>
          </>
        ) : activeView === "2P:L4U4-pLAP:R4-2A" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">Pattern: RHSLB-SSLLpGap&nbsp;&nbsp;L4U4</div>
            <div className="text-xs text-muted-foreground">LEVEL BELOW base, plus the shared RHSLB-SSLLpGap Pattern (RRSS-B + HHLL-B + RRHH-BB + SSLL-BB + SSGap + LLGap + prev day&apos;s PDH/U1 relation HL-A with the gap the wider of the two (pHLGap-A) + today&apos;s PDH/U1 relation HL-B), plus L4U4 (today&apos;s R4 inside prev&apos;s R3/R4 AND prev&apos;s S4 inside today&apos;s S3/S4), plus prev day&apos;s own PDL above today&apos;s Pivot</div>
          </>
        ) : activeView === "6A:HLC-SSLL:R4-6P" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">HHLL-C&nbsp;&nbsp;SSLL-AA&nbsp;&nbsp;RRHH-BB&nbsp;&nbsp;SSGap&nbsp;&nbsp;LLGap</div>
            <div className="text-xs text-muted-foreground">Compressed, today&apos;s PDH/PDL range narrowed on one side and held on the other (HHLL-C), today&apos;s S1/PDL band fully above prev&apos;s (SSLL-AA), today&apos;s R1/PDH band fully below prev&apos;s (RRHH-BB), today&apos;s S1 gap larger than the R1 gap (SSGap), today&apos;s PDL gap larger than the PDH gap (LLGap), today&apos;s S2 above the lower of prev&apos;s S1 and prev&apos;s PDL, and either today&apos;s R2 above the lower of prev&apos;s R1 and prev&apos;s PDH or today&apos;s S3 above the lower of prev&apos;s S1 and prev&apos;s PDL</div>
          </>
        ) : activeView === "8A:HLC-SSHH:S4-1P" ? (
          <>
            <div className="text-xs font-semibold text-rose-400 mb-1">HHLL-C&nbsp;&nbsp;SSLL-AA&nbsp;&nbsp;RRHH-BB&nbsp;&nbsp;SSGap&nbsp;&nbsp;HHGap&nbsp;&nbsp;pHL-A&nbsp;&nbsp;HLGap-B</div>
            <div className="text-xs text-muted-foreground">Compressed, today&apos;s PDH/PDL range narrowed on one side and held on the other (HHLL-C), today&apos;s S1/PDL band fully above prev&apos;s (SSLL-AA), today&apos;s R1/PDH band fully below prev&apos;s (RRHH-BB), today&apos;s S1 gap larger than the R1 gap (SSGap), today&apos;s PDH gap larger than the PDL gap (HHGap), prev day&apos;s PDH/U1 relation is HL-A (pHL-A), and today&apos;s PDH/U1 relation is HL-B with today&apos;s HL gap the wider of the two (HLGap-B)</div>
          </>
        ) : activeView === "9AM:RHLB-RRHH:5AM" ? (
          <>
            <div className="text-xs font-semibold text-rose-400 mb-1">RRGap&nbsp;&nbsp;RRHH-BB&nbsp;&nbsp;HHLL-B&nbsp;&nbsp;HHGap</div>
            <div className="text-xs text-muted-foreground">Compressed, R1 gap larger than S1 gap (RRGap), today&apos;s R1 and PDH both fully below prev&apos;s R1/PDH (RRHH-BB), today&apos;s PDH/PDL both below prev&apos;s (HHLL-B), and today&apos;s PDH gap larger than the PDL gap (HHGap)</div>
          </>
        ) : activeView === "falling" ? (
          <>
            <div className="text-xs font-semibold mb-1 text-destructive">CPR Falling</div>
            <div className="text-xs text-muted-foreground">Bearish directional bias</div>
          </>
        ) : activeView === "inside-value" ? (
          <>
            <div className="text-xs font-semibold mb-1 text-accent">Inside Value CPR</div>
            <div className="text-xs text-muted-foreground">Breakout potential</div>
          </>
        ) : null}
      </div>
      <div className="rounded-lg border border-border bg-card p-3">
        {activeView === "6PM:HHLLA-RRHHGap:6AM" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">Target: U4&nbsp;&nbsp;&nbsp;Entry: 6PM&nbsp;&nbsp;&nbsp;Time: 6AM</div>
            <div className="text-xs text-emerald-400/80">6PM setup with bullish continuation expected toward today&apos;s U4 by ~6AM</div>
          </>
        ) : activeView === "7PM:MoMi->U4:2AM" ? (
          <>
            <div className="text-xs font-semibold text-cyan-400 mb-1">Target: U4&nbsp;&nbsp;&nbsp;Entry: 7PM&nbsp;&nbsp;&nbsp;Time: 2AM</div>
            <div className="text-xs text-cyan-400/80">7PM setup with bullish continuation expected toward today&apos;s U4 by ~2AM</div>
          </>
        ) : activeView === "7PM:MoMi-<L4:2AM" ? (
          <>
            <div className="text-xs font-semibold text-rose-400 mb-1">Target: L4&nbsp;&nbsp;&nbsp;Entry: 7PM&nbsp;&nbsp;&nbsp;Time: 2AM</div>
            <div className="text-xs text-rose-400/80">7PM setup with bearish continuation expected toward today&apos;s L4 by ~2AM</div>
          </>
        ) : activeView === "6PM:APHS1A-FAU4:9PM" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">Target: FAU4&nbsp;&nbsp;&nbsp;Entry: 6PM&nbsp;&nbsp;&nbsp;Time: 9PM</div>
            <div className="text-xs text-muted-foreground">EU2L4 base plus prev day&apos;s own p-EU3L4 pattern, today&apos;s BC above prev day&apos;s own PDH and today&apos;s S1 above prev day&apos;s TC — expected upside far above U4 by ~9PM</div>
          </>
        ) : activeView === "ss-EL1U4-U4:10PM" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">Target: U4&nbsp;&nbsp;Time: 10PM</div>
            <div className="text-xs text-emerald-400/80">Bullish sweep from a deep BELOW LEVEL4 setup — expected recovery toward today&apos;s U4 by ~10PM IST</div>
          </>
        ) : activeView === "9AM:APHS1A-FAU4:4AM" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">Target: FAU4	Time: 3PM</div>
            <div className="text-xs text-muted-foreground">Expected upside far above U4 by ~3PM</div>
          </>
        ) : activeView === "6AM:pX-APHS1A-pL4:4AM" ? (
          <>
            <div className="text-xs font-semibold text-red-400 mb-1">Exp Target: pL4 (prev day&apos;s S4)<br />Entry: 6AM&nbsp;&nbsp;Time: 4AM</div>
            <div className="text-xs text-red-400/80">6AM setup with the prev day&apos;s own p-EU3L4 pattern — expected downside toward pL4 by ~4AM</div>
          </>
        ) : activeView === "8AM:APHS1A-FAU4:4AM" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">Target: FAU4&nbsp;&nbsp;Time: 4AM</div>
            <div className="text-xs text-muted-foreground">EU1L3 base plus today&apos;s BC above prev day&apos;s own PDH and today&apos;s S1 above prev day&apos;s TC — expected upside far above U4 by ~4AM</div>
          </>
        ) : activeView === "SMg-exHiL2L1-U4:3AM" ? (
          <>
            <div className="text-xs font-semibold text-sky-400 mb-1">Exp Target: U4 (today&apos;s R4)<br />Time: 3AM</div>
            <div className="text-xs text-muted-foreground">Expected upside target U4 (today&apos;s R4) by ~3AM</div>
          </>
        ) : activeView === "6AM:MegMeg-L3:8PM" ? (
          <>
            <div className="text-xs font-semibold text-red-400 mb-1">Exp Target: L3 (today&apos;s S3)<br />Time: 8PM</div>
            <div className="text-xs text-muted-foreground">EU1L4 base plus prev/today CPR both Mega width (5.00%–10.00%) — expected downside target L3 (today&apos;s S3) by ~8PM</div>
          </>
        ) : activeView === "TiMe-EUTL3-AU4:2PM" ? (
          <>
            <div className="text-xs font-semibold text-violet-400 mb-1">Exp Target: AU4 (prev day&apos;s R4)<br />Time: 2PM</div>
            <div className="text-xs text-muted-foreground">Expected upside target AU4 (prev day&apos;s R4) by ~2PM</div>
          </>
        ) : showExpU4PU4 && activeView === "overlapping-lower" ? (
          <>
            <div className="text-xs font-semibold text-emerald-400 mb-1">Target</div>
            <div className="text-xs text-muted-foreground">These coins have the potential to go up to U4</div>
          </>
        ) : showExpU3PU3 && activeView === "overlapping-lower" ? (
          <>
            <div className="text-xs font-semibold text-emerald-400 mb-1">Target</div>
            <div className="text-xs text-muted-foreground">These coins have the potential to go farAbove U4</div>
          </>
        ) : showOBLoRRHHLLA && activeView === "overlapping-lower" ? (
          <>
            <div className="text-xs font-semibold text-emerald-400 mb-1">Target</div>
            <div className="text-xs text-muted-foreground">Bullish continuation — these coins have the potential to go up to today&apos;s own U4</div>
          </>
        ) : showOBNLoL4U4 && activeView === "overlapping-lower" ? (
          <>
            <div className="text-xs font-semibold text-emerald-400 mb-1">Target</div>
            <div className="text-xs text-muted-foreground">Compressed structure with today&apos;s CPR Narrow — bullish continuation to U4</div>
          </>
        ) : showOBWLoL4U4 && activeView === "overlapping-lower" ? (
          <>
            <div className="text-xs font-semibold text-emerald-400 mb-1">Target</div>
            <div className="text-xs text-muted-foreground">Same structure but today&apos;s CPR Wide — bullish continuation to U4</div>
          </>
        ) : activeView === "2PM:SSLLpRRHHA-ApU4:5PM" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">
              Target: ApU4&nbsp;&nbsp;&nbsp;Entry: 2PM&nbsp;&nbsp;&nbsp;Time: 5PM
            </div>
            <div className="text-xs text-muted-foreground">
              Bullish continuation from an Overlap-Below setup where today&apos;s S1/PDL both hold above prev day&apos;s tighter floor and today&apos;s R1/PDH both stay under prev day&apos;s tighter ceiling — expected move toward prev day&apos;s U4 by ~5PM IST.
            </div>
          </>
        ) : activeView === "8AM:SSLLpRRHHA-L4:1PM" ? (
          <>
            <div className="text-xs font-semibold text-red-400 mb-1">
              Target: L4&nbsp;&nbsp;&nbsp;Entry: 8AM&nbsp;&nbsp;&nbsp;Time: 1PM
            </div>
            <div className="text-xs text-muted-foreground">
              Bearish sibling of 2PM:SSLLpRRHHA-ApU4:5PM from the same Overlap-Below setup, but split the opposite way (prev day&apos;s R1 below today&apos;s R2, or today&apos;s S3 below prev day&apos;s S2) — expected move toward today&apos;s own L4 by ~1PM IST.
            </div>
          </>
        ) : activeView === "8AM:CoLApHA-U4+1:8AM" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">
              Target: PU4&nbsp;&nbsp;&nbsp;Entry: 8AM&nbsp;&nbsp;&nbsp;Time: 8AM (+1)
            </div>
            <div className="text-xs text-muted-foreground">
              Bullish continuation from an Inside-CPR setup where today&apos;s PDL holds above prev day&apos;s S1 and either today&apos;s PDH clears prev day&apos;s R1 or prev day&apos;s PDH clears today&apos;s R1 — expected move toward prev day&apos;s U4 by ~8AM the next day.
            </div>
          </>
        ) : activeView === "8AM:SRBHHLLA-pU4+1:8AM" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">
              Target: PU4&nbsp;&nbsp;&nbsp;Entry: 8AM&nbsp;&nbsp;&nbsp;Time: 8AM (+1)
            </div>
            <div className="text-xs text-muted-foreground">
              Bullish continuation from an Inside-CPR/CU3L3 setup with contracting pivots — expected move toward prev day&apos;s U4 by ~8AM the next day.
            </div>
          </>
        ) : activeView === "2PM:pPDHLA-SRA-U4:7PM" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">
              Target: U4&nbsp;&nbsp;&nbsp;Entry: 2PM&nbsp;&nbsp;&nbsp;Time: 7PM
            </div>
            <div className="text-xs text-muted-foreground">
              Bullish continuation from an Inside-CPR/CU4L4 setup with pivots stepping up — expected move toward today&apos;s U4 by ~7PM IST.
            </div>
          </>
        ) : activeView === "8AM:pPDHA-SRA-U4+2:2AM" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">
              Target: U4&nbsp;&nbsp;&nbsp;Entry: 8AM&nbsp;&nbsp;&nbsp;Time: 2AM (+2)
            </div>
            <div className="text-xs text-muted-foreground">
              Bullish continuation from an Inside-CPR/EU4L4 setup with today&apos;s SSRRAbove holding — expected move toward today&apos;s U4 by ~2AM, two days out.
            </div>
          </>
        ) : activeView === "6A:SLE-RRHH:R2-6A" ? (
          <>
            <div className="text-xs font-semibold text-emerald-400 mb-1">Target: U2&nbsp;&nbsp;&nbsp;Entry: 6AM&nbsp;&nbsp;&nbsp;Time: 6AM</div>
            <div className="text-xs text-muted-foreground">6AM setup with bullish continuation expected toward today&apos;s U2 (R2) by ~6AM</div>
          </>
        ) : activeView === "levelsabove" ? (
          <>
            <div className="text-xs font-semibold text-emerald-400 mb-1">Bias: Bullish shift</div>
            <div className="text-xs text-emerald-400/80">Today&apos;s CPR has stepped one band above yesterday&apos;s — TC inside prev&apos;s U2 zone, S1 still within prev&apos;s wider BC/R1 range</div>
          </>
        ) : activeView === "levelsbelow" ? (
          <>
            <div className="text-xs font-semibold text-emerald-400 mb-1">Bias: Bullish shift</div>
            <div className="text-xs text-emerald-400/80">Today&apos;s CPR has stepped above yesterday&apos;s lower band while prev Pivot still caps the U1/U2 zone</div>
          </>
        ) : activeView === "3P:HA-pBELOWR1:R2-3A" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">Target: U2&nbsp;&nbsp;&nbsp;Entry: 3PM&nbsp;&nbsp;&nbsp;Time: 3AM (+1)</div>
            <div className="text-xs text-emerald-400/80">3PM setup with bullish continuation expected toward today&apos;s U2 (R2) by ~3AM the next day</div>
          </>
        ) : activeView === "3P:HA-pABOVER1:S2-6P" ? (
          <>
            <div className="text-xs font-semibold text-rose-400 mb-1">Target: L2&nbsp;&nbsp;&nbsp;Entry: 3PM&nbsp;&nbsp;&nbsp;Time: 6PM</div>
            <div className="text-xs text-muted-foreground">3PM setup with bearish continuation expected toward today&apos;s S2 (L2) by ~6PM</div>
          </>
        ) : activeView === "2P:HA-HABOVEpR1:R4-4P" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">Target: U4&nbsp;&nbsp;&nbsp;Entry: 2PM&nbsp;&nbsp;&nbsp;Time: 4PM</div>
            <div className="text-xs text-emerald-400/80">2PM setup with bullish continuation expected toward today&apos;s U4 (R4) by ~4PM</div>
          </>
        ) : activeView === "PDH>pTC-U4:5AM" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">Target: U4&nbsp;&nbsp;Time: 5AM</div>
            <div className="text-xs text-emerald-400/80">Today already trading above prev day&apos;s TC, with a pMini→Small or pSmall→Large width expansion — expected continuation toward today&apos;s U4 by ~5AM</div>
          </>
        ) : activeView === "11AM:pCPR1AHi-FApU4:1PM" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">Target: FApU4&nbsp;&nbsp;Time: 1PM</div>
            <div className="text-xs text-emerald-400/80">L4U3 base plus HHLLBelow (today&apos;s highs/lows stepping down vs prev day), prev day&apos;s own PDH below R1, today&apos;s PDH above R1, and today&apos;s R1 at/above prev BC — expected move far above prev day&apos;s U4 by ~1PM</div>
          </>
        ) : activeView === "2P:L4U4-pLAP:R4-2A" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">Target: U4&nbsp;&nbsp;&nbsp;Entry: 2PM&nbsp;&nbsp;&nbsp;Time: 2AM</div>
            <div className="text-xs text-emerald-400/80">RHSLB-SSLLpGap base plus L4U4 (today&apos;s R4 inside prev&apos;s R3/R4, prev&apos;s S4 inside today&apos;s S3/S4) plus prev day&apos;s own PDL above today&apos;s Pivot — expected move toward today&apos;s own U4 (R4) by ~2AM</div>
          </>
        ) : activeView === "6A:HLC-SSLL:R4-6P" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">Target: U4&nbsp;&nbsp;&nbsp;Entry: 6AM&nbsp;&nbsp;&nbsp;Time: 6PM</div>
            <div className="text-xs text-emerald-400/80">6AM setup with bullish continuation expected toward today&apos;s U4 (R4) by ~6PM</div>
          </>
        ) : activeView === "8A:HLC-SSHH:S4-1P" ? (
          <>
            <div className="text-xs font-semibold text-rose-400 mb-1">Target: L4&nbsp;&nbsp;&nbsp;Entry: 8AM&nbsp;&nbsp;&nbsp;Time: 1PM</div>
            <div className="text-xs text-muted-foreground">8AM setup with bearish continuation expected toward today&apos;s S4 (L4) by ~1PM</div>
          </>
        ) : activeView === "9AM:RHLB-RRHH:5AM" ? (
          <>
            <div className="text-xs font-semibold text-rose-400 mb-1">Target: L2&nbsp;&nbsp;Time: 5AM</div>
            <div className="text-xs text-muted-foreground">Expected move down to today&apos;s S2 (L2) by ~5AM</div>
          </>
        ) : null}
      </div>
    </div>
  );
}