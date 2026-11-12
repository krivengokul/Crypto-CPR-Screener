import type { ViewDef } from "../types";

/**
 * Previous-session 15m P-filters as Backtest categories.
 *
 * Exclusive assignment (matches Screener candleBucket / charts):
 *   P-MOMENTUM-B     — MOM-B only (TC reference + R2 wick; not CON-B)
 *   P-CONSOLIDATE-B  — CON-B only (TC/floor references + R2/S2 wicks); not also CON-A
 *   P-VOLATILE-R1S1  — bodies inside max(R1,PH)…min(S1,PL), and none of CON-A/CON-B/MOM-A/MOM-B
 *   P-CONSOLIDATE-A  — CON-A only (within Pivot floor → max(R1,PH)); not also CON-B
 *   P-MOMENTUM-A     — MOM-A only (from Pivot floor & above; not CON-A)
 */
export const CATEGORY_VIEWS: ViewDef[] = [
  {
    key: "CON-A",
    label: "P-CON-A",
    kind: "category",
    // CON-A alone
    condition: (r) =>
      r.PD15MConsolidateAPass === true && r.PD15MBelowTCPass !== true,
    order: 1.1,
  },
  {
    key: "MOM-A",
    label: "P-MOM-A",
    kind: "category",
    condition: (r) =>
      r.PD15MAboveBCPass === true && r.PD15MConsolidateAPass !== true,
    order: 1.2,
  },
  {
    // Internal key stays "INSIDE-R1S1" (saved selections / flags); the
    // displayed name is P-VOL-C. Listed right after P-MOM-A.
    key: "INSIDE-R1S1",
    label: "P-VOL-C",
    kind: "category",
    // Same exclusive bucket as the Screener: none of the other four P-filters.
    condition: (r) =>
      r.PD15MInsideR1S1Pass === true &&
      r.PD15MConsolidateAPass !== true &&
      r.PD15MBelowTCPass !== true &&
      r.PD15MAboveBCPass !== true &&
      r.PD15MMomentumBPass !== true,
    order: 1.25,
  },
  {
    key: "CON-B",
    label: "P-CON-B",
    kind: "category",
    // CON-B alone
    condition: (r) =>
      r.PD15MBelowTCPass === true && r.PD15MConsolidateAPass !== true,
    order: 1.3,
  },
  {
    key: "MOM-B",
    label: "P-MOM-B",
    kind: "category",
    condition: (r) =>
      r.PD15MMomentumBPass === true && r.PD15MBelowTCPass !== true,
    order: 1.4,
  },
  {
    key: "levelsabove",
    label: "LEVEL ABOVE",
    kind: "category",
    condition: (r) => r.LevelsAbove,
    order: 2,
  },
  {
    key: "levelsbelow",
    label: "LEVEL BELOW",
    kind: "category",
    condition: (r) => r.LevelsBelow,
    order: 3,
  },
  {
    key: "compressed",
    label: "COMPRESSED",
    kind: "category",
    condition: (r) => r.compressed,
    order: 4,
  },
  {
    key: "expanded",
    label: "EXPANDED",
    kind: "category",
    condition: (r) => r.expanded,
    order: 5,
  },
];
