import type { CPRResult } from "../cpr";
import type { ViewTreeNode } from "./types";

/**
 * Display-level de-duplication for the Backtest picker.
 *
 * The same pattern (e.g. "C-C-BB-AA-CU4L4") is registered once per section
 * that lists it (COMPRESSED, TOUCH → INCPR, …), so the picker shows it several
 * times. This module decides which of those copies the picker may hide and
 * which section "twins" should be offered as small chips on the visible row.
 *
 * Nothing here touches the registry: every copy keeps its own key, parent
 * chain and section gate, so selecting a twin (via its chip) runs exactly the
 * backtest the hidden row used to run. Only the picker's layout changes.
 *
 * Two nodes are treated as the same pattern ONLY when all of these hold:
 *   1. they have the same label,
 *   2. their own `condition` returns identical results over a large grid of
 *      synthetic CPR results (condition source text can't be compared — the
 *      hand-written and generated copies are written in different styles), and
 *   3. that condition is not constant and never throws on the probes
 *      (a constant/throwing condition can't be told apart from another one).
 * The parent/section gate is deliberately NOT part of the comparison — it is
 * what distinguishes the copies.
 */

export const PATTERN_SELECTION_SEP = "::";

export interface PatternTwin {
  /** Picker selection value of the hidden twin (category::…::pattern keys). */
  value: string;
  catKey: string;
  /** Human-readable section, e.g. "TOUCH › INCPR". */
  context: string;
}

export interface PatternDedupe {
  /** Selection values of copies that the picker should not render. */
  hidden: ReadonlySet<string>;
  /** Visible copy's selection value → its hidden twins (for chips). */
  twins: ReadonlyMap<string, PatternTwin[]>;
  /** Selection value → its section label, for every member of a duplicate group. */
  contextOf: ReadonlyMap<string, string>;
  /** Hidden copy's selection value → the visible copy that stands in for it. */
  primaryOf: ReadonlyMap<string, string>;
}

const EMPTY: PatternDedupe = {
  hidden: new Set(),
  twins: new Map(),
  contextOf: new Map(),
  primaryOf: new Map(),
};

const SSRR = ["RRSS-A", "RRSS-B", "RRSS-C", "RRSS-E"];
const HHLL = ["HHLL-A", "HHLL-B", "HHLL-C", "HHLL-E"];
const RRHH = ["RRHH-AA", "RRHH-OA", "RRHH-BB", "RRHH-OB", "RRHH-C", "RRHH-E", "RRHH-RA", "RRHH-HA"];
const SSLL = ["SSLL-AA", "SSLL-OA", "SSLL-BB", "SSLL-OB", "SSLL-C", "SSLL-E", "SSLL-SB", "SSLL-LB"];
const COMBOS = SSRR.length * HHLL.length * RRHH.length * SSLL.length; // 1024
const SEEDS = 3;

function hashBool(prop: string, seed: number, combo: number): boolean {
  // FNV-1a over "prop|seed|combo" — cheap, deterministic, well mixed.
  let h = 2166136261;
  const s = `${prop}|${seed}|${combo}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) & 1) === 1;
}

let probes: CPRResult[] | null = null;
function getProbes(): CPRResult[] {
  if (probes) return probes;
  const list: CPRResult[] = [];
  for (let seed = 0; seed < SEEDS; seed++) {
    for (let combo = 0; combo < COMBOS; combo++) {
      const fields: Record<string, unknown> = {
        SSRRCategory: SSRR[combo & 3],
        HHLLCategory: HHLL[(combo >> 2) & 3],
        RRHHCategory: RRHH[(combo >> 4) & 7],
        SSLLCategory: SSLL[(combo >> 7) & 7],
      };
      list.push(
        new Proxy(fields, {
          get(target, prop) {
            if (typeof prop !== "string") return undefined;
            if (prop in target) return target[prop];
            // Every other flag gets an independent pseudo-random boolean, so
            // two conditions reading different flags give different results.
            return hashBool(prop, seed, combo);
          },
        }) as unknown as CPRResult,
      );
    }
  }
  probes = list;
  return list;
}

/** Bit-string of the condition's results over the probe grid, or null when unusable. */
function conditionSignature(node: ViewTreeNode): string | null {
  const cond = node.viewDef?.condition;
  if (!cond) return null;
  const grid = getProbes();
  const bits: string[] = new Array(grid.length);
  let sawTrue = false;
  let sawFalse = false;
  try {
    for (let i = 0; i < grid.length; i++) {
      const v = cond(grid[i]!) === true;
      bits[i] = v ? "1" : "0";
      if (v) sawTrue = true;
      else sawFalse = true;
    }
  } catch {
    return null;
  }
  if (!sawTrue || !sawFalse) return null;
  return bits.join("");
}

interface Entry {
  node: ViewTreeNode;
  value: string;
  catKey: string;
  context: string;
  groupKey: string | null;
  children: Entry[];
}

const cache = new WeakMap<ViewTreeNode[], PatternDedupe>();

export function computePatternDedupe(tree: ViewTreeNode[]): PatternDedupe {
  const hit = cache.get(tree);
  if (hit) return hit;

  // Pass 1: label counts, so signatures are only computed for labels that repeat.
  const labelCount = new Map<string, number>();
  const countLabels = (n: ViewTreeNode) => {
    if (n.kind === "pattern") labelCount.set(n.label, (labelCount.get(n.label) ?? 0) + 1);
    n.children.forEach(countLabels);
  };
  tree.forEach((cat) => cat.children.forEach(countLabels));

  // Pass 2: pre-order walk in picker order — the first copy of a group is the one that stays visible.
  const ordered: Entry[] = [];
  const build = (
    cat: ViewTreeNode,
    node: ViewTreeNode,
    ancestors: ViewTreeNode[],
  ): Entry | null => {
    if (node.kind !== "pattern") return null;
    const path = [...ancestors, node];
    const sig = (labelCount.get(node.label) ?? 0) > 1 ? conditionSignature(node) : null;
    const contextParts = [
      cat.label,
      ...ancestors.filter((a) => !node.label.startsWith(a.label)).map((a) => a.label),
    ];
    const entry: Entry = {
      node,
      value: [cat.key, ...path.map((p) => p.key)].join(PATTERN_SELECTION_SEP),
      catKey: cat.key,
      context: contextParts.join(" › "),
      groupKey: sig ? `${node.label}|${sig}` : null,
      children: [],
    };
    ordered.push(entry);
    for (const child of node.children) {
      const e = build(cat, child, path);
      if (e) entry.children.push(e);
    }
    return entry;
  };
  const roots: Entry[] = [];
  for (const cat of tree) {
    for (const child of cat.children) {
      const e = build(cat, child, []);
      if (e) roots.push(e);
    }
  }

  const groups = new Map<string, Entry[]>();
  for (const e of ordered) {
    if (!e.groupKey) continue;
    const g = groups.get(e.groupKey);
    if (g) g.push(e);
    else groups.set(e.groupKey, [e]);
  }

  // A later copy is redundant when it is not the group's first copy, has no
  // Views of its own, and everything nested under it is redundant too.
  const redundant = new Map<string, boolean>();
  const isRedundant = (e: Entry): boolean => {
    const cached = redundant.get(e.value);
    if (cached !== undefined) return cached;
    let result = false;
    if (e.groupKey) {
      const group = groups.get(e.groupKey)!;
      const isFirst = group[0] === e;
      const hasViews = e.node.children.some((c) => c.kind === "view");
      result = !isFirst && !hasViews && e.children.every(isRedundant);
    }
    redundant.set(e.value, result);
    return result;
  };
  roots.forEach(isRedundant);
  ordered.forEach(isRedundant);

  const hidden = new Set<string>();
  const twins = new Map<string, PatternTwin[]>();
  const contextOf = new Map<string, string>();
  const primaryOf = new Map<string, string>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const primary = group[0]!;
    for (const e of group) {
      contextOf.set(e.value, e.context);
      if (redundant.get(e.value)) {
        hidden.add(e.value);
        primaryOf.set(e.value, primary.value);
        const list = twins.get(primary.value) ?? [];
        list.push({ value: e.value, catKey: e.catKey, context: e.context });
        twins.set(primary.value, list);
      }
    }
  }

  const result: PatternDedupe = hidden.size === 0 ? EMPTY : { hidden, twins, contextOf, primaryOf };
  cache.set(tree, result);
  return result;
}
