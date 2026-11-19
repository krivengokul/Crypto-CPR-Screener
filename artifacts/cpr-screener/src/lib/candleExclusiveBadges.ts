/**
 * Exclusive P-day / PP-day badge labels — single source of truth for
 * Screener rows, SignalDesk, and (diagnosis order) Pattern Stats.
 *
 * Rule-based P-day / PP-day labels. VOL-C requires both band sides to pass;
 * VOL-A requires its floor-side and Pivot-floor rules; VOL-B requires its
 * ceiling-side and Pivot-ceiling rules.
 *
 * Uses stamped PD15M* / PD15MPP* flags on the row (written by
 * usePreviousCandleFilters after the 15m prep scans).
 */
import type { CSSProperties } from "react";
import type { CPRResult } from "@/lib/cpr";
import { isMicroOrTinyCPRSize } from "@/lib/views/cprSizes";

export type ExclusiveCandleBadge = {
  text: string;
  className: string;
  style?: CSSProperties;
};

export type ExclusiveCandleRuleInputs = {
  prefix: "P" | "PP";
  conA: boolean;
  conB: boolean;
  conSide: "A" | "B" | null;
  momA: boolean;
  momB: boolean;
  inside: boolean;
  volA: boolean;
  volB: boolean;
  volCLime: boolean;
  volALime: boolean;
  volBLime: boolean;
};

/** Shared exclusive P/PP rule priority. Callers provide evaluated rule results. */
export function classifyExclusiveCandleLabel(
  rules: ExclusiveCandleRuleInputs,
): string | null {
  const { prefix, conA, conB, conSide, momA, momB, inside, volA, volB } = rules;
  const exclusiveConB = conB && (!conA || conSide === "B");
  const exclusiveConA = conA && (!conB || conSide !== "B");
  if (exclusiveConB) return `${prefix}-CON-B`;
  if (momB && !conA && !conB) return `${prefix}-MOM-B`;
  if (exclusiveConA) return `${prefix}-CON-A`;
  if (momA && !conA && !conB) return `${prefix}-MOM-A`;
  if (inside && !conA && !conB) {
    return `${prefix}-VOL-C${rules.volCLime ? "" : " ✗"}`;
  }
  if (volA && !conA && !conB && !momA && !momB && !inside) {
    return `${prefix}-VOL-A${rules.volALime ? "" : " ✗"}`;
  }
  if (volB && !conA && !conB && !momA && !momB && !inside && !volA) {
    return `${prefix}-VOL-B${rules.volBLime ? "" : " ✗"}`;
  }
  return null;
}

export function exclusiveCandleLabelColor(label: string): string {
  if (label.includes("CON-B")) return "#ff6bb5";
  if (label.includes("MOM-B")) return "#a78bfa";
  if (label.includes("CON-A")) return label.startsWith("PP-") ? "#2dd4bf" : "#03b07c";
  if (label.includes("MOM-A")) return "#22d3ee";
  if (label.includes("VOL-") && label.includes("✗")) return "#ff637e";
  if (label.includes("VOL-")) return "#a3e635";
  return "#cbd5e1";
}

function badgeFromLabel(label: string | null): ExclusiveCandleBadge | null {
  if (!label) return null;
  const color = exclusiveCandleLabelColor(label);
  return {
    text: label,
    className: "font-mono text-xs font-bold uppercase tracking-widest",
    style: { color },
  };
}

/** Previous-day (P) exclusive stack. */
export function exclusivePDayBadge(
  r: CPRResult | undefined | null,
  props?: ExclusivePProps,
): ExclusiveCandleBadge | null {
  if (!r) return null;
  const conA = r.PD15MConsolidateAPass === true;
  const conB = r.PD15MBelowTCPass === true;
  const volAFromR2 = r.PD15MVolAR2Pass === true && r.PD15MVolAPass === true;
  const momA = !volAFromR2 && (props?.isMomentumA ?? (r.PD15MAboveBCPass === true || r.PD15MVolAMomAPass === true));
  const volBFromS2 = r.PD15MVolBS2Pass === true && r.PD15MVolBPass === true;
  const momB = !volBFromS2 && (props?.isMomentumB ?? (r.PD15MMomentumBPass === true || r.PD15MVolBMomBPass === true));
  const inside = props?.isInsideR1S1 ?? (r.PD15MInsideR1S1Pass === true);
  const prevIsMicroOrTiny = isMicroOrTinyCPRSize(r.prevCPR?.widthPct);
  return badgeFromLabel(classifyExclusiveCandleLabel({
    prefix: "P",
    conA: props?.isConsolidateA ?? conA,
    conB: props?.isConsolidateB ?? conB,
    conSide: r.PD15MConsolidateExclusive ?? null,
    momA,
    momB,
    inside,
    volA: props?.isVolA ?? (r.PD15MVolAPass === true),
    volB: props?.isVolB ?? (r.PD15MVolBPass === true),
    volCLime: !!(
      r.touchCategory || r.ppTouchCategory || prevIsMicroOrTiny ||
      isMicroOrTinyCPRSize(r.todayCPR?.widthPct)
    ),
    volALime: !!(r.touchCategory || prevIsMicroOrTiny),
    volBLime: !!(r.touchCategory || prevIsMicroOrTiny),
  }));
}

/** Exclusive P-day categories supplied by the live Screener prep scan. */
export type ExclusivePProps = {
  isConsolidateA?: boolean;
  isConsolidateB?: boolean;
  isMomentumA?: boolean;
  isMomentumB?: boolean;
  isInsideR1S1?: boolean;
  isVolA?: boolean;
  isVolB?: boolean;
};

/**
 * Merge Screener exclusive props into stamp flags so the row can show a
 * badge when either the prep included-set OR the row stamp says pass.
 */
export type ExclusivePPProps = {
  isPPConsolidateA?: boolean;
  isPPConsolidateB?: boolean;
  isPPMomentumA?: boolean;
  isPPMomentumB?: boolean;
  isPPVolatileR1S1?: boolean;
  isPPVolA?: boolean;
  isPPVolB?: boolean;
};

export function mergePPStampsWithProps(
  r: CPRResult,
  props?: ExclusivePPProps | null,
): CPRResult {
  if (!props) return r;
  return {
    ...r,
    PD15MPPConsolidateAPass:
      props.isPPConsolidateA === true || r.PD15MPPConsolidateAPass === true,
    PD15MPPConsolidateBPass:
      props.isPPConsolidateB === true || r.PD15MPPConsolidateBPass === true,
    PD15MPPMomentumAPass:
      props.isPPMomentumA === true || r.PD15MPPMomentumAPass === true,
    PD15MPPMomentumBPass:
      props.isPPMomentumB === true || r.PD15MPPMomentumBPass === true,
    PD15MPPInsideR1S1Pass:
      props.isPPVolatileR1S1 === true || r.PD15MPPInsideR1S1Pass === true,
    PD15MPPVolAPass: props.isPPVolA === true || r.PD15MPPVolAPass === true,
    PD15MPPVolBPass: props.isPPVolB === true || r.PD15MPPVolBPass === true,
  };
}

/** Day-before-previous (PP) exclusive stack — same order as Pattern Stats. */
export function exclusivePPDayBadge(
  r: CPRResult | undefined | null,
  props?: ExclusivePPProps | null,
): ExclusiveCandleBadge | null {
  if (!r) return null;
  const row = mergePPStampsWithProps(r, props);
  const conB = row.PD15MPPConsolidateBPass === true;
  const ppVolBFromS2 = row.PD15MPPVolBS2Pass === true && row.PD15MPPVolBPass === true;
  const momB = !ppVolBFromS2 && (row.PD15MPPMomentumBPass === true || row.PD15MPPVolBMomBPass === true);
  const conA = row.PD15MPPConsolidateAPass === true;
  const ppVolAFromR2 = row.PD15MPPVolAR2Pass === true && row.PD15MPPVolAPass === true;
  const momA = !ppVolAFromR2 && (row.PD15MPPMomentumAPass === true || row.PD15MPPVolAMomAPass === true);
  const inside = row.PD15MPPInsideR1S1Pass === true;
  const ppIsMicroOrTiny = isMicroOrTinyCPRSize(row.ppCPR?.widthPct);
  return badgeFromLabel(classifyExclusiveCandleLabel({
    prefix: "PP",
    conA,
    conB,
    conSide: row.PD15MPPConsolidateExclusive ?? null,
    momA,
    momB,
    inside,
    volA: row.PD15MPPVolAPass === true,
    volB: row.PD15MPPVolBPass === true,
    volCLime: !!(
      row.pppTouchCategory || row.ppTouchCategory || ppIsMicroOrTiny ||
      isMicroOrTinyCPRSize(row.todayCPR?.widthPct)
    ),
    volALime: !!(row.ppTouchCategory || row.pppTouchCategory || ppIsMicroOrTiny),
    volBLime: !!(row.ppTouchCategory || row.pppTouchCategory || ppIsMicroOrTiny),
  }));
}
