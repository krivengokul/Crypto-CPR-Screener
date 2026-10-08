import type { ViewDef } from "../types";

export const CATEGORY_VIEWS: ViewDef[] =  [
  // Previous-session 15m filters (the Screener's P-CONSOLIDATE-A/B and
  // P-MOMENTUM-A/B buttons) as Backtest categories, ordered between TOP 15
  // LOSERS (1) and LEVEL ABOVE (2). The flags are populated by
  // categoryScanSymbolOnDate in backtest.ts. MOMENTUM excludes the matching
  // CONSOLIDATE set, same as the Screener buttons.
  { key: "CON-A", label: "P-CONSOLIDATE-A", kind: "category", condition: (r) => r.PD15MConsolidateAPass === true,
      order: 1.1
},
  { key: "MOM-A", label: "P-MOMENTUM-A", kind: "category", condition: (r) => r.PD15MAboveBCPass === true && r.PD15MConsolidateAPass !== true,
      order: 1.2
},
  { key: "CON-B", label: "P-CONSOLIDATE-B", kind: "category", condition: (r) => r.PD15MBelowTCPass === true,
      order: 1.3
},
  { key: "MOM-B", label: "P-MOMENTUM-B", kind: "category", condition: (r) => r.PD15MMomentumBPass === true && r.PD15MBelowTCPass !== true,
      order: 1.4
},
  { key: "levelsabove", label: "LEVEL ABOVE", kind: "category", condition: (r) => r.LevelsAbove,
      order: 2
},
  { key: "levelsbelow", label: "LEVEL BELOW", kind: "category", condition: (r) => r.LevelsBelow,
      order: 3
},
  { key: "compressed", label: "COMPRESSED", kind: "category", condition: (r) => r.compressed,
      order: 4
},
  { key: "expanded", label: "EXPANDED", kind: "category", condition: (r) => r.expanded,
      order: 5
},
];
