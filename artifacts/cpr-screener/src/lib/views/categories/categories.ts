import type { ViewDef } from "../types";

/**
 * Previous-session 15m P-filters as Backtest categories.
 *
 * Exclusive assignment (matches Screener candleBucket / charts):
 *   P-MOMENTUM-B     — MOM-B only (from TC & below; not CON-B)
 *   P-CONSOLIDATE-B  — CON-B only (within TC → min(S1,PL)); not also CON-A
 *   P-INSIDE-R1S1    — CON-A ∩ CON-B only (candles in both bands ⇒ R1/PH ↔ S1/PL)
 *   P-CONSOLIDATE-A  — CON-A only (within BC → max(R1,PH)); not also CON-B
 *   P-MOMENTUM-A     — MOM-A only (from BC & above; not CON-A)
 */
export const CATEGORY_VIEWS: ViewDef[] = [
  {
    key: "CON-A",
    label: "P-CONSOLIDATE-A",
    kind: "category",
    // CON-A alone — dual CON-A+CON-B goes to INSIDE-R1S1
    condition: (r) =>
      r.PD15MConsolidateAPass === true && r.PD15MBelowTCPass !== true,
    order: 1.1,
  },
  {
    key: "MOM-A",
    label: "P-MOMENTUM-A",
    kind: "category",
    condition: (r) =>
      r.PD15MAboveBCPass === true && r.PD15MConsolidateAPass !== true,
    order: 1.2,
  },
  {
    key: "CON-B",
    label: "P-CONSOLIDATE-B",
    kind: "category",
    // CON-B alone — dual goes to INSIDE-R1S1
    condition: (r) =>
      r.PD15MBelowTCPass === true && r.PD15MConsolidateAPass !== true,
    order: 1.3,
  },
  {
    key: "MOM-B",
    label: "P-MOMENTUM-B",
    kind: "category",
    condition: (r) =>
      r.PD15MMomentumBPass === true && r.PD15MBelowTCPass !== true,
    order: 1.4,
  },
  {
    key: "INSIDE-R1S1",
    label: "P-INSIDE-R1S1",
    kind: "category",
    // Only symbols that pass BOTH consolidate checks (overlap band)
    condition: (r) =>
      r.PD15MConsolidateAPass === true && r.PD15MBelowTCPass === true,
    order: 1.5,
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
