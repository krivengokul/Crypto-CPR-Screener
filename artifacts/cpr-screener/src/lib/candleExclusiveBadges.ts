/**
 * Exclusive P-day / PP-day badge labels — single source of truth for
 * Screener rows, SignalDesk, and (diagnosis order) Pattern Stats.
 *
 * Priority (first match wins):
 *   CON-B → MOM-B → CON-A → MOM-A → VOL-C (inside R1/S1) → VOL-A → VOL-B
 *
 * Uses stamped PD15M* / PD15MPP* flags on the row (written by
 * usePreviousCandleFilters after the 15m prep scans).
 */
import type { CSSProperties } from "react";
import type { CPRResult } from "@/lib/cpr";
import { isMicroOrTinyCPRSize } from "@/lib/views/cprSizes";
import { getWidthCategory } from "@/pages/ScreenerUtils";

export type ExclusiveCandleBadge = {
  text: string;
  className: string;
  style?: CSSProperties;
};

/** Previous-day (P) exclusive stack. */
export function exclusivePDayBadge(
  r: CPRResult | undefined | null,
): ExclusiveCandleBadge | null {
  if (!r) return null;
  const conA = r.PD15MConsolidateAPass === true;
  const conB = r.PD15MBelowTCPass === true;
  const momA = r.PD15MAboveBCPass === true;
  const momB = r.PD15MMomentumBPass === true;
  const inside = r.PD15MInsideR1S1Pass === true;
  const exclusiveConB = conB && (!conA || r.PD15MConsolidateExclusive === "B");
  const exclusiveConA = conA && (!conB || r.PD15MConsolidateExclusive !== "B");

  if (exclusiveConB) {
    return {
      text: "P-CON-B",
      className:
        "font-mono text-xs font-bold uppercase tracking-widest text-[#ff6bb5]",
      style: { color: "#ff6bb5" },
    };
  }
  if (momB && !conA && !conB) {
    return {
      text: "P-MOM-B",
      className:
        "font-mono text-xs font-bold uppercase tracking-widest text-violet-400",
    };
  }
  if (exclusiveConA) {
    return {
      text: "P-CON-A",
      className: "font-mono text-xs font-bold uppercase tracking-widest",
      style: { color: "#03b07c" },
    };
  }
  if (momA && !conA && !conB) {
    return {
      text: "P-MOM-A",
      className:
        "font-mono text-xs font-bold uppercase tracking-widest text-cyan-400",
    };
  }
  if (inside && !conA && !conB) {
    const prevIsMicroOrTiny = isMicroOrTinyCPRSize(r.prevCPR?.widthPct);
    if (r.ppTouchCategory || prevIsMicroOrTiny) {
      return {
        text: "P-VOL-C",
        className: "font-mono text-xs font-bold uppercase tracking-widest",
        style: { color: "#a3e635" },
      };
    }
    return {
      text: "P-VOL-C ✗",
      className: "font-mono text-xs font-bold uppercase tracking-widest",
      style: { color: "#ff637e" },
    };
  }
  if (
    r.PD15MVolAPass === true &&
    !conA &&
    !conB &&
    !momA &&
    !momB &&
    !inside
  ) {
    if (r.touchCategory) {
      return {
        text: "P-VOL-A",
        className: "font-mono text-xs font-bold uppercase tracking-widest",
        style: { color: "#a3e635" },
      };
    }
    return {
      text: "P-VOL-A ✗",
      className: "font-mono text-xs font-bold uppercase tracking-widest",
      style: { color: "#ff637e" },
    };
  }
  if (
    r.PD15MVolBPass === true &&
    !conA &&
    !conB &&
    !momA &&
    !momB &&
    !inside &&
    r.PD15MVolAPass !== true
  ) {
    if (r.touchCategory) {
      return {
        text: "P-VOL-B",
        className: "font-mono text-xs font-bold uppercase tracking-widest",
        style: { color: "#a3e635" },
      };
    }
    return {
      text: "P-VOL-B ✗",
      className: "font-mono text-xs font-bold uppercase tracking-widest",
      style: { color: "#ff637e" },
    };
  }
  return null;
}

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
  const momB = row.PD15MPPMomentumBPass === true;
  const conA = row.PD15MPPConsolidateAPass === true;
  const momA = row.PD15MPPMomentumAPass === true;
  const inside = row.PD15MPPInsideR1S1Pass === true;
  const exclusiveConB =
    conB && (!conA || row.PD15MPPConsolidateExclusive === "B");
  const exclusiveConA =
    conA && (!conB || row.PD15MPPConsolidateExclusive !== "B");

  if (exclusiveConB) {
    return {
      text: "PP-CON-B",
      className: "font-mono text-xs font-bold uppercase tracking-widest",
      style: { color: "#f472b6" },
    };
  }
  if (momB && !conA && !conB) {
    return {
      text: "PP-MOM-B",
      className:
        "font-mono text-xs font-bold uppercase tracking-widest text-violet-400",
    };
  }
  if (exclusiveConA) {
    return {
      text: "PP-CON-A",
      className: "font-mono text-xs font-bold uppercase tracking-widest",
      style: { color: "#2dd4bf" },
    };
  }
  if (momA && !conA && !conB) {
    return {
      text: "PP-MOM-A",
      className:
        "font-mono text-xs font-bold uppercase tracking-widest text-cyan-400",
    };
  }
  if (inside && !conA && !conB) {
    const ppIsMicroOrTiny = isMicroOrTinyCPRSize(row.ppCPR?.widthPct);
    if (row.pppTouchCategory || ppIsMicroOrTiny) {
      return {
        text: "PP-VOL-C",
        className: "font-mono text-xs font-bold uppercase tracking-widest",
        style: { color: "#a3e635" },
      };
    }
    return {
      text: "PP-VOL-C ✗",
      className: "font-mono text-xs font-bold uppercase tracking-widest",
      style: { color: "#ff637e" },
    };
  }
  if (
    row.PD15MPPVolAPass === true &&
    !conA &&
    !conB &&
    !momA &&
    !momB &&
    !inside
  ) {
    const ppIsMicro =
      Number.isFinite(row.ppCPR?.widthPct) &&
      getWidthCategory(row.ppCPR!.widthPct).key === "micro";
    if (row.ppTouchCategory || ppIsMicro) {
      return {
        text: "PP-VOL-A",
        className: "font-mono text-xs font-bold uppercase tracking-widest",
        style: { color: "#a3e635" },
      };
    }
    return {
      text: "PP-VOL-A ✗",
      className: "font-mono text-xs font-bold uppercase tracking-widest",
      style: { color: "#ff637e" },
    };
  }
  if (
    row.PD15MPPVolBPass === true &&
    !conA &&
    !conB &&
    !momA &&
    !momB &&
    !inside &&
    row.PD15MPPVolAPass !== true
  ) {
    const ppIsMicro =
      Number.isFinite(row.ppCPR?.widthPct) &&
      getWidthCategory(row.ppCPR!.widthPct).key === "micro";
    if (row.ppTouchCategory || ppIsMicro) {
      return {
        text: "PP-VOL-B",
        className: "font-mono text-xs font-bold uppercase tracking-widest",
        style: { color: "#a3e635" },
      };
    }
    return {
      text: "PP-VOL-B ✗",
      className: "font-mono text-xs font-bold uppercase tracking-widest",
      style: { color: "#ff637e" },
    };
  }
  return null;
}
