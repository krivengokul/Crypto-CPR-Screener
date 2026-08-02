import { subPatterns } from "@/components/ui/PatternSidebar"

export interface ScreenerLegendProps {
  activePattern: string;
  showBAComp: boolean;
  showLACompressed: boolean;
  showLAT1U46AM: boolean;
  showLASsHiL4U4FAU42AM: boolean;
  showLAMeMieXL4U3U46PM: boolean;
  showLBE11: boolean;
  showLBC2L2U2: boolean;
  showExpU4PU4: boolean;
  showExpU3PU3: boolean;
  showOBNLoL4U4: boolean;
  showOBWLoL4U4: boolean;
  showOBHiExL4U4: boolean;
  showLMeXL2U2: boolean;
  showExpU3LtPU4: boolean;
  showBigBeloweXLoL3U4AU4: boolean;
  showBigBeloweXU4L2AU4: boolean;
  showBigBelow1TcOU4L43PM: boolean;
  showHRHAL: boolean;
  showHiL4U4FAU4: boolean;
  show1ScoHiFAU4: boolean;
  show2ScoHiFAU4: boolean;
  showHAU1L1AbovePU4: boolean;
  showHAU1PWideAbove: boolean;
  showHAU1: boolean;
  showOutsideCPReXHrL3U3AU4: boolean;
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
    activePattern,
    showBAComp,
    showLACompressed,
    showLAT1U46AM,
    showLASsHiL4U4FAU42AM,
    showLAMeMieXL4U3U46PM,
    showLBE11,
    showLBC2L2U2,
    showExpU4PU4,
    showExpU3PU3,
    showOBNLoL4U4,
    showOBWLoL4U4,
    showOBHiExL4U4,
    showLMeXL2U2,
    showExpU3LtPU4,
    showBigBeloweXLoL3U4AU4,
    showBigBeloweXU4L2AU4,
    showBigBelow1TcOU4L43PM,
    showHRHAL,
    showHiL4U4FAU4,
    show1ScoHiFAU4,
    show2ScoHiFAU4,
    showHAU1L1AbovePU4,
    showHAU1PWideAbove,
    showHAU1,
    showOutsideCPReXHrL3U3AU4,
  } = props;
  
  // Map a sub-pattern id (selected via the sidebar tree, e.g. "co2-l2u2")
  // back to its parent category id (e.g. "littlebelow"), so Legend Card 1
  // still shows the parent's overview card instead of going blank when a
  // child pattern is the active one. Parent ids and standalone patterns
  // (which aren't anyone's child) just resolve to themselves.
  function getLegendParentPattern(patternId: string): string {
    for (const [parentId, children] of Object.entries(subPatterns)) {
      if (children.some((c) => c.id === patternId)) return parentId;
    }
    return patternId;
  }
  const legendPattern = getLegendParentPattern(activePattern);

  return (
     <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
      <div className="rounded-lg border border-border bg-card p-3">
        {/* NEW: label + badges now share the first row (badges shrunk to
            px-1.5 py-0.5 text-[10px]) so more horizontal room is freed
            up. This card is keyed only on activePattern (never on any
            showXXX subfilter state), so it stays exactly the same
            regardless of which subfilter chip is selected inside a
            section. The old "ADK CPR Formula" fallback for unmatched
            patterns has been removed entirely — unmatched patterns now
            render nothing here. Coverage extended to every category in
            the left nav (patterns array in PatternSidebar.tsx). */}
        {legendPattern === "structure-bigabove" ? (
          <>
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className="text-xs font-semibold text-primary">BigCPR Above</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500 text-white">Above</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-500 text-white">Wide</span>
            </div>
            <div className="text-xs text-muted-foreground">Wide CPR Above PCPR — today&apos;s CPR is wider than yesterday&apos;s and present above it</div>
          </>
        ) : legendPattern === "structure-bigbelow" ? (
          <>
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className="text-xs font-semibold text-primary">Big Below</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-500 text-white">Below</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-500 text-white">Wide</span>
            </div>
            <div className="text-xs text-muted-foreground">Wide CPR Below PCPR — today&apos;s CPR is wider than yesterday&apos;s and present below it</div>
          </>
        ) : legendPattern === "littleabove" ? (
          <>
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className="text-xs font-semibold text-primary">LittleCPR Above</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500 text-white">Above</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-cyan-500 text-white">Narrow</span>
            </div>
            <div className="text-xs text-muted-foreground">Narrow CPR Above PCPR — today&apos;s CPR is narrower than yesterday&apos;s and present above it</div>
          </>
        ) : legendPattern === "littlebelow" ? (
          <>
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className="text-xs font-semibold text-primary">LittleCPR Below</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-500 text-white">Below</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500 text-white">Narrow</span>
            </div>
            <div className="text-xs text-muted-foreground">Narrow CPR Below PCPR — today&apos;s CPR is narrower than yesterday&apos;s and present below it</div>
          </>
        ) : legendPattern === "overlapping-lower" ? (
          <>
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className="text-xs font-semibold text-primary">Overlapping Lower</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-500 text-white">Overlap</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500 text-white">Lower</span>
            </div>
            <div className="text-xs text-muted-foreground">Today&apos;s CPR overlaps below yesterday&apos;s CPR</div>
          </>
        ) : legendPattern === "overlapping-higher" ? (
          <>
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className="text-xs font-semibold text-primary">Overlapping Higher</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-500 text-white">Overlap</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-500 text-white">Higher</span>
            </div>
            <div className="text-xs text-muted-foreground">Today&apos;s CPR overlaps above yesterday&apos;s CPR</div>
          </>
        ) : legendPattern === "cpr-1-above" ? (
          <>
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className="text-xs font-semibold text-primary">CPR 1ABOVE</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-500 text-white">Above</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500 text-white">Pivot Level</span>
            </div>
            <div className="text-xs text-muted-foreground">Today&apos;s TC sits between prev R1 and R2, and today&apos;s S1 sits between prev BC and R1</div>
          </>
        ) : legendPattern === "pcpr-u1-cpr-pl1" ? (
          <>
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className="text-xs font-semibold text-primary">PREVCPR 1ABOVE</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-500 text-white">Above</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500 text-white">Pivot Level</span>
            </div>
            <div className="text-xs text-muted-foreground">Yesterday&apos;s Pivot sits between today&apos;s R1 and R2, and today&apos;s BC sits between yesterday&apos;s S1 and BC</div>
          </>
        ) : legendPattern === "l1pu1-above" ? (
          <>
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className="text-xs font-semibold text-primary">L1pU1 Above</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-500 text-white">Above</span>
            </div>
            <div className="text-xs text-muted-foreground">Today&apos;s S1 / PDL sits above yesterday&apos;s R1 / PDH</div>
          </>
        ) : legendPattern === "inside-cpr" ? (
          <>
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className="text-xs font-semibold text-primary">CPR Inside</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-500 text-white">Inside</span>
            </div>
            <div className="text-xs text-muted-foreground">Today&apos;s CPR sits inside yesterday&apos;s CPR range</div>
          </>
        ) : legendPattern === "outside-cpr" ? (
          <>
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className="text-xs font-semibold text-primary">CPR Outside</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-500 text-white">Outside</span>
            </div>
            <div className="text-xs text-muted-foreground">Today&apos;s CPR sits outside yesterday&apos;s CPR range</div>
          </>
        ) : legendPattern === "equal-cpr" ? (
          <>
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className="text-xs font-semibold text-primary">Equal CPR</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500 text-white">Equal</span>
            </div>
            <div className="text-xs text-muted-foreground">Previous &amp; today&apos;s CPR are effectively equal</div>
          </>
        ) : activePattern === "u1-gt-pu4" ? (
          <>
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className="text-xs font-semibold text-primary">U1&gt;pU4</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500 text-white">U1&gt;PU4</span>
            </div>
            <div className="text-xs text-muted-foreground">Today&apos;s R1 above prev day&apos;s R4</div>
          </>
        ) : activePattern === "l1-lt-pl4" ? (
          <>
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className="text-xs font-semibold text-primary">L1&lt;pL4</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-destructive text-white">L1&lt;PL4</span>
            </div>
            <div className="text-xs text-muted-foreground">Today&apos;s S1 below prev day&apos;s S4</div>
          </>
        ) : null}
      </div>
      <div className="rounded-lg border border-border bg-card p-3">
        {activePattern === "ss-eXU4L1-U4:10PM" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">Pattern: eXU4L1&nbsp;&nbsp;PCPR: Wide&nbsp;&nbsp;pBC &gt; U1</div>
            <div className="text-xs text-muted-foreground">L1&lt;pL4 base — cprFalling + strWideCPR + Prev &amp; Today PDH above their R1 + eXU4L1 (Prev R4 in Today R3/R4, Prev S4 in Today BC/S1) + Prev CPR&apos;s BC above Today&apos;s R1</div>
          </>
        ) : activePattern === "SL-eXL3U1-FAU4:3PM" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">Pattern: eXL3U1  PCPR: Small  CPR: Large</div>
            <div className="text-xs text-muted-foreground">Big CPR Above (Wide + Rising) + Today&apos;s R1 &gt; Prev R4 + Pattern eXL3U1 + Compression Ratio &gt; 300</div>
          </>
        ) : activePattern === "TiMe-eXL3TC-AU4:2PM" ? (
          <>
            <div className="text-xs font-semibold text-violet-400 mb-1">Pattern: eXL3TC  PCPR: Tiny  CPR: Mega</div>
            <div className="text-xs text-muted-foreground">Big CPR Above (Wide + Rising) + Today&apos;s R1 &gt; Prev R4 + Pattern eXL3TC (Prev S4 inside Today&apos;s S2/S3, Prev R4 inside Today&apos;s Pivot/TC) + Prev CPR width 0.10%–0.22% (Tiny), Today CPR width 5.00%–10.00% (Mega)</div>
          </>
        ) : showBAComp && activePattern === "structure-bigabove" ? (
          <>
            <div className="text-xs font-semibold text-sky-400 mb-1">Compressed Inside Prev UL2</div>
            <div className="text-xs text-muted-foreground">U3/U4 inside PU2/PU1 and L4 inside PL1/PL2</div>
          </>
        ) : showLACompressed && activePattern === "littleabove" ? (
          <>
            <div className="text-xs font-semibold text-emerald-400 mb-1">Compressed Inside Previous L2 and Previous U3</div>
            <div className="text-xs text-muted-foreground">Compressed Todays L4/U4 Inside Previous L2/U3</div>
          </>
        ) : (showLAT1U46AM && activePattern === "littleabove") || activePattern === "T1-U4:6AM" ? (
          <>
            <div className="text-xs font-semibold text-orange-400 mb-1">Pattern: exL3U2  PCPR: Tiny  CPR: Micro</div>
            <div className="text-xs text-muted-foreground">Today's Pivot &gt; Prev R1, Prev CPR width 0.10%–0.22% (pTiny), Today CPR width ≤ 0.10% (Micro)</div>
          </>
        ) : (showLASsHiL4U4FAU42AM && activePattern === "littleabove") || activePattern === "Ss-HiL4U4-FAU4:2AM" ? (
          <>
            <div className="text-xs font-semibold text-fuchsia-400 mb-1">Pattern: HiL4U4  PCPR: Small  CPR: Small</div>
            <div className="text-xs text-muted-foreground">cprRising + narrowCPR + AllStepUp above/below, Today S1 &gt; Prev PDL, Today R1 &gt; Prev PDH, Today PDH &gt; Today R1, both CPRs 0.60%–1.10% (Small)</div>
          </>
        ) : (showLAMeMieXL4U3U46PM && activePattern === "littleabove") || activePattern === "MeMi-eXL4U3-U4:6PM" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">Pattern: eXL4U3  PCPR: Medium  CPR: Mini</div>
            <div className="text-xs text-muted-foreground">cprRising + narrowCPR + eXL4U3, Today's TC ≥ Prev R1, Prev CPR 1.10%–2.00% (Medium), Today CPR 0.22%–0.60% (Mini)</div>
          </>
        ) : showLBE11 && activePattern === "littlebelow" ? (
          <>
            <div className="text-xs font-semibold text-amber-400 mb-1">Compressed Inside Previous R1/R2 and Previous S2/S3</div>
            <div className="text-xs text-muted-foreground">Today&apos;s R4 inside Prev R1/R2, Today&apos;s S4 inside Prev S2/S3, both CPRs 1%–1.5% wide</div>
          </>
        ) : showLBC2L2U2 && activePattern === "littlebelow" ? (
          <>
            <div className="text-xs font-semibold text-emerald-400 mb-1">Compressed Inside Previous L2 and Previous U2</div>
            <div className="text-xs text-muted-foreground">Compressed Todays L4/U4 Inside Previous L2/U2</div>
          </>
        ) : activePattern === "L1-cOU1L2-U4:1AM" ? (
          <>
            <div className="text-xs font-semibold text-sky-400 mb-1">Pattern: cOU1L2  PCPR: Large  CPR: Micro</div>
            <div className="text-xs text-muted-foreground">Pivot cOU1L2, Today&apos;s R1 &gt; Prev CPR BC, Today&apos;s R1 &lt; Today&apos;s PDH, Prev CPR width 2%–5% (Large), Today CPR width ≤ 0.10% (Micro)</div>
          </>
        ) : showExpU4PU4 && activePattern === "overlapping-lower" ? (
          <>
            <div className="text-xs font-semibold text-sky-400 mb-1">Expanded</div>
            <div className="text-xs text-muted-foreground">Prev R4 between today&apos;s R3/R4 and Prev S4 between today&apos;s S3/S4 with today&apos;s CPR Mini</div>
          </>
        ) : showExpU3PU3 && activePattern === "overlapping-lower" ? (
          <>
            <div className="text-xs font-semibold text-sky-400 mb-1">Expanded</div>
            <div className="text-xs text-muted-foreground">Todays U3 &gt; Prev U4/Todays L3 &lt; Prev L4 , today&apos;s CPR is Narrow</div>
          </>
        ) : showOBNLoL4U4 && activePattern === "overlapping-lower" ? (
          <>
            <div className="text-xs font-semibold text-cyan-400 mb-1">Overlap Lower, Narrow</div>
            <div className="text-xs text-muted-foreground">Today&apos;s R4 inside Prev R3/R4, Prev S4 inside Today&apos;s S3/S4, today&apos;s CPR Narrow, Compression &gt; 50%</div>
          </>
        ) : showOBWLoL4U4 && activePattern === "overlapping-lower" ? (
          <>
            <div className="text-xs font-semibold text-rose-400 mb-1">Overlap Lower, Wide</div>
            <div className="text-xs text-muted-foreground">Today&apos;s R4 inside Prev R3/R4, Prev S4 inside Today&apos;s S3/S4, today&apos;s CPR Wide, Compression &gt; 50%</div>
          </>
        ) : showOBHiExL4U4 && activePattern === "overlapping-higher" ? (
          <>
            <div className="text-xs font-semibold text-pink-400 mb-1">eXHi-L4U4-U4</div>
            <div className="text-xs text-muted-foreground">Overlap Higher — Prev R4 between today&apos;s R3/R4, Prev S4 between today&apos;s S3/S4, Prev CPR pSmall, Today CPR Tiny</div>
          </>
          ) : showLMeXL2U2 && activePattern === "overlapping-higher" ? (
          <>
            <div className="text-xs font-semibold text-red-400 mb-1">
              Pattern: eXL2U2&nbsp;&nbsp;PCPR: Large&nbsp;&nbsp;CPR: Medium
            </div>
            <div className="text-xs text-muted-foreground">
              Overlap Above + eXL2U2 (today&apos;s S2 above prev S1 AND today&apos;s R2 above prev R1) + Compression Ratio 60%–90%.
            </div>
          </>
        ) : showExpU3LtPU4 && activePattern === "structure-bigbelow" ? (
          <>
            <div className="text-xs font-semibold text-rose-400 mb-1">Expanded</div>
            <div className="text-xs text-muted-foreground">Todays U4 is above PU4 and Todays L3/L4 below PL4</div>
            <div className="text-xs text-muted-foreground">Prev CPR &lt;1% / Today CPR &lt;3%, PDL &lt;L1</div>
          </>
        ) : showBigBeloweXLoL3U4AU4 && activePattern === "structure-bigbelow" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">eXLoL3U4-AU4</div>
            <div className="text-xs text-muted-foreground">Wide Below — Prev R4 between today&apos;s R3/R4, Prev S4 above today&apos;s S3</div>
          </>
        ) : showBigBeloweXU4L2AU4 && activePattern === "structure-bigbelow" ? (
          <>
            <div className="text-xs font-semibold text-amber-400 mb-1">eXU4L2-AU4</div>
            <div className="text-xs text-muted-foreground">Wide Below + eXU4L2 (Prev R4 inside today&apos;s R3/R4, Prev S4 inside today&apos;s S1/S2), Prev R3 &gt; Today R3, Today R1 or Prev S1 between the two Pivots</div>
          </>
        ) : showBigBelow1TcOU4L43PM && activePattern === "structure-bigbelow" ? (
          <>
            <div className="text-xs font-semibold text-fuchsia-400 mb-1">Pattern: cOU4L4  PCPR: Micro  CPR: Tiny</div>
            <div className="text-xs text-muted-foreground">Wide Below + cOU4L4, Prev R1 between Today&apos;s R1/R2, Today&apos;s S1 between Prev S1/S2, Prev PDH &gt; Prev R1, Prev CPR ≤ 0.10% (Micro), Today CPR 0.10%–0.22% (Tiny)</div>
          </>
        ) : showHRHAL && activePattern === "structure-bigabove" ? (
          <>
            <div className="text-xs font-semibold text-orange-400 mb-1">hR-HAL</div>
            <div className="text-xs text-muted-foreground">Pivot Level: Higher, Today&apos;s TC between Prev R1/R2, Today&apos;s R3 &gt; Prev R4</div>
          </>
        ) : showHiL4U4FAU4 && activePattern === "structure-bigabove" ? (
          <>
            <div className="text-xs font-semibold text-fuchsia-400 mb-1">1T-HiL4U4-FAU4</div>
            <div className="text-xs text-muted-foreground">Wide Above + HiL4U4 (Prev R4 inside Today&apos;s R3/R4, Today&apos;s S4 inside Prev S3/S4), Prev CPR pMicro, Today CPR Tiny</div>
          </>
        ) : activePattern === "eXL4U2-U4:4AM" ? (
          <>
            <div className="text-xs font-semibold text-purple-400 mb-1">eXL4U2-U4:4AM</div>
            <div className="text-xs text-muted-foreground">Wide Above + Pattern: eXL4U2, Today&apos;s S1 &gt; Prev TC, Today&apos;s BC &gt; Prev R1, Size Ratio ≥ 200%</div>
          </>
        ) : (show1ScoHiFAU4 && activePattern === "structure-bigabove") || activePattern === "1S-cOL3U4-FAU4:1AM" ? (
          <>
            <div className="text-xs font-semibold text-teal-400 mb-1">Pattern: cOL3U4  PCPR: Tiny  CPR: Small</div>
            <div className="text-xs text-muted-foreground">Pivot cOL3U4, Today&apos;s S1 &gt; Prev Pivot, Prev CPR width ≤ 0.10% (Tiny), Today CPR width 0.60%–1.10% (Small)</div>
          </>
        ) : (show2ScoHiFAU4 && activePattern === "structure-bigabove") || activePattern === "TS-cOL3U4-AU4R:4PM" ? (
          <>
            <div className="text-xs font-semibold text-cyan-400 mb-1">Pattern: cOL3U4  PCPR: Tiny  CPR: Small</div>
            <div className="text-xs text-muted-foreground">Pivot cOL3U4, Today&apos;s S1 &gt; Prev Pivot, Prev CPR width 0.10%–0.22% (Tiny), Today CPR width 0.60%–1.10% (Small)</div>
          </>
        ) : showHAU1L1AbovePU4 && activePattern === "structure-bigabove" ? (
          <>
            <div className="text-xs font-semibold text-lime-400 mb-1">L1 &gt; Previous U4</div>
            <div className="text-xs text-muted-foreground">Today&apos;s L1 has broken above yesterday&apos;s R4 — strong bullish momentum</div>
          </>
        ) : showHAU1PWideAbove && activePattern === "structure-bigabove" ? (
          <>
            <div className="text-xs font-semibold text-fuchsia-400 mb-1">pWideAbove</div>
            <div className="text-xs text-muted-foreground">Prev day&apos;s CPR wider than pp-CPR and sits above pp-CPR — momentum carried over two days</div>
          </>
        ) : showHAU1 && activePattern === "structure-bigabove" ? (
          <>
            <div className="text-xs font-semibold text-sky-400 mb-1">U1 &gt; Previous U4</div>
            <div className="text-xs text-muted-foreground">Todays U1&gt; Previous U4</div>
          </>
        ) : showOutsideCPReXHrL3U3AU4 && activePattern === "outside-cpr" ? (
          <>
            <div className="text-xs font-semibold text-rose-400 mb-1">eXHrL3U3-AU4</div>
            <div className="text-xs text-muted-foreground">Prev S4 between today&apos;s S3/S4, Prev R4 between today&apos;s R2/R3</div>
          </>
        ) : activePattern === "cpr-1-above" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">Pivot Level: CPR in prev U2 band</div>
            <div className="text-xs text-muted-foreground">Today TC &gt; prev R1 &amp; &lt; prev R2 — today S1 &gt; prev BC &amp; &lt; prev R1</div>
          </>
        ) : activePattern === "pcpr-u1-cpr-pl1" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">Pivot Level: pCPR in U1 band</div>
            <div className="text-xs text-muted-foreground">Prev Pivot &gt; today R1 &amp; &lt; today R2 — today BC &gt; prev S1 &amp; &lt; prev BC</div>
          </>
        ) : activePattern === "BC>pPDL-U3:5AM" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">Pivot Level: pCPR in U1 band</div>
            <div className="text-xs text-muted-foreground">PCPR 1ABOVE base, plus today&apos;s BC above prev day&apos;s PDH</div>
          </>
        ) : activePattern === "PDH>pTC-U4:5AM" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">Pivot Level: pCPR in U1 band</div>
            <div className="text-xs text-muted-foreground">PCPR 1ABOVE base, plus today&apos;s PDH above prev day&apos;s TC, plus (pMini &amp; today Small) or (pSmall &amp; today Large)</div>
          </>
        ) : activePattern === "SMi-L1pU1>-APU4:11PM" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">Pivot Level: Compressed</div>
            <div className="text-xs text-muted-foreground">PCPR: Small&nbsp;&nbsp;CPR: Mini</div>
          </>
        ) : activePattern === "S0-L1pU1>-AU4:7PM" ? (
          <>
            <div className="text-xs font-semibold text-amber-400 mb-1">Pivot Level: 1-Line CPR</div>
            <div className="text-xs text-muted-foreground">Today &amp; Prev PDH/L Above, not Outside CPR — single-line CPR (compression 0%) &amp; today&apos;s R1 below Prev TC</div>
          </>
        ) : activePattern === "T0-L1pU1>-BPL4:5AM" ? (
          <>
            <div className="text-xs font-semibold text-rose-400 mb-1">Pivot Level: Tiny / 1-Line Inside</div>
            <div className="text-xs text-muted-foreground">Today &amp; Prev PDH/L Above, not Outside CPR — PCPR &gt;300% compressed &amp; below today&apos;s S1, or a single-line inside CPR</div>
          </>
        ) : activePattern === "falling" ? (
          <>
            <div className="text-xs font-semibold mb-1 text-destructive">CPR Falling</div>
            <div className="text-xs text-muted-foreground">Bearish directional bias</div>
          </>
        ) : activePattern === "inside-value" ? (
          <>
            <div className="text-xs font-semibold mb-1 text-accent">Inside Value CPR</div>
            <div className="text-xs text-muted-foreground">Breakout potential</div>
          </>
        ) : null}
      </div>
      <div className="rounded-lg border border-border bg-card p-3">
        {activePattern === "ss-eXU4L1-U4:10PM" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">Target: U4&nbsp;&nbsp;Time: 10PM</div>
            <div className="text-xs text-emerald-400/80">Bullish sweep from a deep L1&lt;pL4 setup — expected recovery toward today&apos;s U4 by ~10PM IST</div>
          </>
        ) : activePattern === "SL-eXL3U1-FAU4:3PM" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">Target: FAU4	Time: 3PM</div>
            <div className="text-xs text-muted-foreground">Expected upside far above U4 by ~3PM</div>
          </>
        ) : activePattern === "TiMe-eXL3TC-AU4:2PM" ? (
          <>
            <div className="text-xs font-semibold text-violet-400 mb-1">Exp Target: AU4 (prev day&apos;s R4)<br />Time: 2PM</div>
            <div className="text-xs text-muted-foreground">Expected upside target AU4 (prev day&apos;s R4) by ~2PM</div>
          </>
        ) : showBAComp && activePattern === "structure-bigabove" ? (
          <>
            <div className="text-xs font-semibold text-emerald-400 mb-1">Target</div>
            <div className="text-xs text-muted-foreground">These coins have the potential to go up to U4</div>
          </>
        ) : showLACompressed && activePattern === "littleabove" ? (
          <>
            <div className="text-xs font-semibold text-emerald-400 mb-1">Target</div>
            <div className="text-xs text-muted-foreground">Bullish Above PU4</div>
          </>
        ) : (showLAT1U46AM && activePattern === "littleabove") || activePattern === "T1-U4:6AM" ? (
          <>
            <div className="text-xs font-semibold text-orange-400 mb-1">Expected Target: U4<br />Time: 6AM</div>
            <div className="text-xs text-muted-foreground">Expected upside target U4 by ~6AM</div>
          </>
        ) : (showLASsHiL4U4FAU42AM && activePattern === "littleabove") || activePattern === "Ss-HiL4U4-FAU4:2AM" ? (
          <>
            <div className="text-xs font-semibold text-fuchsia-400 mb-1">Exp Target: Far Above U4 (T-5 U4)<br />Time: 2AM</div>
            <div className="text-xs text-muted-foreground">Expected upside far above U4 (T-5 U4) by ~2AM</div>
          </>
        ) : (showLAMeMieXL4U3U46PM && activePattern === "littleabove") || activePattern === "MeMi-eXL4U3-U4:6PM" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">Exp Target: U4 (T-5 AU4)<br />Time: 6PM</div>
            <div className="text-xs text-muted-foreground">Expected upside target U4 (T-5 AU4) by ~6PM</div>
          </>
        ) : showLBE11 && activePattern === "littlebelow" ? (
          <>
            <div className="text-xs font-semibold text-emerald-400 mb-1">Target</div>
            <div className="text-xs text-muted-foreground">Bullish to PU4</div>
          </>
        ) : showLBC2L2U2 && activePattern === "littlebelow" ? (
          <>
            <div className="text-xs font-semibold text-emerald-400 mb-1">Target</div>
            <div className="text-xs text-muted-foreground">Bullish to U4</div>
          </>
        ) : activePattern === "L1-cOU1L2-U4:1AM" ? (
          <>
            <div className="text-xs font-semibold text-sky-400 mb-1">Exp Target: U4<br />Time: 1AM</div>
            <div className="text-xs text-muted-foreground">Expected upside target U4 by ~1AM</div>
          </>
        ) : showExpU4PU4 && activePattern === "overlapping-lower" ? (
          <>
            <div className="text-xs font-semibold text-emerald-400 mb-1">Target</div>
            <div className="text-xs text-muted-foreground">These coins have the potential to go up to U4</div>
          </>
        ) : showExpU3PU3 && activePattern === "overlapping-lower" ? (
          <>
            <div className="text-xs font-semibold text-emerald-400 mb-1">Target</div>
            <div className="text-xs text-muted-foreground">These coins have the potential to go farAbove U4</div>
          </>
        ) : showOBNLoL4U4 && activePattern === "overlapping-lower" ? (
          <>
            <div className="text-xs font-semibold text-emerald-400 mb-1">Target</div>
            <div className="text-xs text-muted-foreground">Compressed structure with today&apos;s CPR Narrow — bullish continuation to U4</div>
          </>
        ) : showOBWLoL4U4 && activePattern === "overlapping-lower" ? (
          <>
            <div className="text-xs font-semibold text-emerald-400 mb-1">Target</div>
            <div className="text-xs text-muted-foreground">Same structure but today&apos;s CPR Wide — bullish continuation to U4</div>
          </>
        ) : showOBHiExL4U4 && activePattern === "overlapping-higher" ? (
          <>
            <div className="text-xs font-semibold text-emerald-400 mb-1">Target</div>
            <div className="text-xs text-muted-foreground">Overlap Higher continuation — bullish bias toward U4</div>
          </>
          ) : showLMeXL2U2 && activePattern === "overlapping-higher" ? (
          <>
            <div className="text-xs font-semibold text-red-400 mb-1">
              Target: L4&nbsp;&nbsp;&nbsp;Time: 10PM
            </div>
            <div className="text-xs text-muted-foreground">
              Bearish rotation from the Overlap-Above zone — expected sweep toward today&apos;s L4 by ~10PM IST.
            </div>
          </>
        ) : showExpU3LtPU4 && activePattern === "structure-bigbelow" ? (
          <>
            <div className="text-xs font-semibold text-emerald-400 mb-1">Target</div>
            <div className="text-xs text-muted-foreground">These coins have the potential to go far Below PL4</div>
          </>
        ) : showBigBeloweXLoL3U4AU4 && activePattern === "structure-bigbelow" ? (
          <>
            <div className="text-xs font-semibold text-emerald-400 mb-1">Target</div>
            <div className="text-xs text-muted-foreground">Bearish continuation — further downside below prev day&apos;s S3/S4</div>
          </>
        ) : showBigBeloweXU4L2AU4 && activePattern === "structure-bigbelow" ? (
          <>
            <div className="text-xs font-semibold text-destructive mb-1">Target</div>
            <div className="text-xs text-muted-foreground">Bearish continuation — further downside below today&apos;s S4</div>
          </>
        ) : showBigBelow1TcOU4L43PM && activePattern === "structure-bigbelow" ? (
          <>
            <div className="text-xs font-semibold text-fuchsia-400 mb-1">Exp Target: U4<br />Time: 3PM</div>
            <div className="text-xs text-muted-foreground">Expected downside target U4 by ~3PM</div>
          </>
        ) : showHRHAL && activePattern === "structure-bigabove" ? (
          <>
            <div className="text-xs font-semibold text-emerald-400 mb-1">Target</div>
            <div className="text-xs text-muted-foreground">Higher pivot structure with room to run to U4</div>
          </>
        ) : showHiL4U4FAU4 && activePattern === "structure-bigabove" ? (
          <>
            <div className="text-xs font-semibold text-emerald-400 mb-1">Target</div>
            <div className="text-xs text-muted-foreground">Tight compression breaking wide above prior structure — potential to run far above U4</div>
          </>
        ) : (show1ScoHiFAU4 && activePattern === "structure-bigabove")  || activePattern === "1S-cOL3U4-FAU4:1AM" ? (
          <>
            <div className="text-xs font-semibold text-teal-400 mb-1">Exp Target: Far Above U4 (T-5 U4)<br />Time: 1AM</div>
            <div className="text-xs text-muted-foreground">Expected upside far above U4 (T-5 U4) by ~1AM</div>
          </>
        ) : (show2ScoHiFAU4 && activePattern === "structure-bigabove")  || activePattern === "TS-cOL3U4-AU4R:4PM" ? (
          <>
            <div className="text-xs font-semibold text-cyan-400 mb-1">Exp Target: Far Above U4 (T-5 U4)<br />Time: 5AM</div>
            <div className="text-xs text-muted-foreground">Expected upside far above U4 (T-5 U4) by ~5AM</div>
          </>
        ) : showHAU1L1AbovePU4 && activePattern === "structure-bigabove" ? (
          <>
            <div className="text-xs font-semibold text-emerald-400 mb-1">Target</div>
            <div className="text-xs text-muted-foreground">Bullish potential target of U4</div>
          </>
        ) : showHAU1PWideAbove && activePattern === "structure-bigabove" ? (
          <>
            <div className="text-xs font-semibold text-emerald-400 mb-1">Target</div>
            <div className="text-xs text-muted-foreground">Confirms sustained bullish structure — bias toward continuation to U4</div>
          </>
        ) : showHAU1 && activePattern === "structure-bigabove" ? (
          <>
            <div className="text-xs font-semibold text-emerald-400 mb-1">Breakout</div>
            <div className="text-xs text-muted-foreground">Today&apos;s R1 has broken above yesterday&apos;s R4 — strong bullish momentum</div>
          </>
        ) : showOutsideCPReXHrL3U3AU4 && activePattern === "outside-cpr" ? (
          <>
            <div className="text-xs font-semibold text-emerald-400 mb-1">Target</div>
            <div className="text-xs text-muted-foreground">Tight prior-day CPR that expanded outside it — breakout continuation potential</div>
          </>
        ) : activePattern === "cpr-1-above" ? (
          <>
            <div className="text-xs font-semibold text-emerald-400 mb-1">Bias: Bullish shift</div>
            <div className="text-xs text-emerald-400/80">Today&apos;s CPR has stepped one band above yesterday&apos;s — TC inside prev&apos;s U2 zone, S1 still within prev&apos;s wider BC/R1 range</div>
          </>
        ) : activePattern === "pcpr-u1-cpr-pl1" ? (
          <>
            <div className="text-xs font-semibold text-emerald-400 mb-1">Bias: Bullish shift</div>
            <div className="text-xs text-emerald-400/80">Today&apos;s CPR has stepped above yesterday&apos;s lower band while prev Pivot still caps the U1/U2 zone</div>
          </>
        ) : activePattern === "BC>pPDL-U3:5AM" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">Target: U3&nbsp;&nbsp;Time: 5AM</div>
            <div className="text-xs text-emerald-400/80">Expected move toward today&apos;s U3 by ~5AM</div>
          </>
        ) : activePattern === "PDH>pTC-U4:5AM" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">Target: U4&nbsp;&nbsp;Time: 5AM</div>
            <div className="text-xs text-emerald-400/80">Today already trading above prev day&apos;s TC, with a pMini→Small or pSmall→Large width expansion — expected continuation toward today&apos;s U4 by ~5AM</div>
          </>
        ) : activePattern === "SMi-L1pU1>-APU4:11PM" ? (
          <>
            <div className="text-xs font-semibold text-green-400 mb-1">Target: ApU4&nbsp;&nbsp;Time: 11PM</div>
            <div className="text-xs text-emerald-400/80">Expected move above prev U4 by ~11PM</div>
          </>
        ) : activePattern === "S0-L1pU1>-AU4:7PM" ? (
          <>
            <div className="text-xs font-semibold text-amber-400 mb-1">Target: AU4&nbsp;&nbsp;Time: 7PM</div>
            <div className="text-xs text-emerald-400/80">Expected move above prev U4 (AU4) by ~7PM</div>
          </>
        ) : activePattern === "T0-L1pU1>-BPL4:5AM" ? (
          <>
            <div className="text-xs font-semibold text-rose-400 mb-1">Target: BPL4&nbsp;&nbsp;Time: 5AM</div>
            <div className="text-xs text-muted-foreground">Expected move below prev S4 (PL4) by ~5AM</div>
          </>
        ) : null}
      </div>
    </div>
  );
}
