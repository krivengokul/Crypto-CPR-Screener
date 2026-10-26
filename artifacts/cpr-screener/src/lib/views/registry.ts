import type { CPRResult } from "../cpr";
import type { ViewDef, ViewTreeNode } from "./types";

export const VIEWS: ViewDef[] = [];

export function getView(key: string): ViewDef | undefined {
  return VIEWS.find((v) => v.key === key);
}

const activeEvaluationKeys = new Set<string>();

export function passesView(r: CPRResult, key: string): boolean {
  if (activeEvaluationKeys.has(key)) return false;
  activeEvaluationKeys.add(key);
  try {
    const v = getView(key);
    if (!v) return false;
    if (v.conditionKey && v.conditionKey !== key) return passesView(r, v.conditionKey);
    if (v.parentKey && !v.standalone && v.parentKey !== key && !passesView(r, v.parentKey)) return false;
    return v.condition ? v.condition(r) : false;
  } finally {
    activeEvaluationKeys.delete(key);
  }
}

export function childrenOf(parentKey: string | undefined): ViewDef[] {
  return VIEWS.filter((v) => v.parentKey === parentKey).sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0)
  );
}

function buildViewTreeNode(v: ViewDef): ViewTreeNode {
  return {
    key: v.key,
    label: v.label,
    kind: v.kind,
    order: v.order,
    children: childrenOf(v.key).map(buildViewTreeNode),
    viewDef: v,
  };
}

export function buildViewTree(): ViewTreeNode[] {
  const rootCategories = VIEWS.filter((v) => v.kind === "category");

  const buildNode = (def: ViewDef): ViewTreeNode => {
    const rawChildren = VIEWS.filter((v) => v.parentKey === def.key);
    const children = rawChildren
      .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999))
      .map(buildNode);

    return {
      key: def.key,
      label: def.label,
      kind: def.kind ?? "view",
      order: def.order,
      children,
      viewDef: def,
    };
  };

  return rootCategories
    .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999))
    .map(buildNode);
}

export function ancestorChain(key: string): ViewDef[] {
  const chain: ViewDef[] = [];
  let curr = getView(key);
  while (curr?.parentKey) {
    const parent = getView(curr.parentKey);
    if (!parent) break;
    chain.unshift(parent);
    curr = parent;
  }
  return chain;
}

export function topLevelCategoryOf(key: string): ViewDef | undefined {
  const chain = ancestorChain(key);
  return chain.find((v) => v.kind === "category") ?? (getView(key)?.kind === "category" ? getView(key) : undefined);
}
