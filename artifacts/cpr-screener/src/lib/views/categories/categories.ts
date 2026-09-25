import type { ViewDef } from "../types";

export const CATEGORY_VIEWS: ViewDef[] =  [
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
