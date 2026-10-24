/**
 * Console helper: which stored chart links would Legend Card 2 show for a View,
 * and why not the others?
 *
 *   await cprLegendLinksFor("R1-B-B-BB-BB-L4U4-RH-GapAA-R4")   // View key
 *   await cprLegendLinksFor("B6-L4U4-pStepUp")                 // or its label
 *   await cprLegendLinksFor("R1-…", { limit: 40 })             // same cap the Legend uses
 *
 * Read-only: it never writes anything. It reads this browser's chart links
 * (Firestore + local cache) and applies the same matching the Legend uses
 * (findHistoricalChartLinks + the Legend's alias rules).
 */

import { VIEWS, getView } from "@/lib/views";
import {
  findHistoricalChartLinks,
  getAllChartLinkRecords,
  parseChartRowKey,
  type StoredChartLinkRecord,
} from "@/lib/chartLinks";

export type LegendLinkRow = {
  rowKey: string;
  date: string;
  symbol: string;
  storedViewKey: string;
  url: string;
  status: "SHOWN" | "HIDDEN";
  reason: string;
};

function describeStoredKey(stored: string): string {
  const s = stored.trim();
  if (!s) return "no lastViewKey saved (unattributed)";
  const last = s.split("::").filter(Boolean).pop() || s;
  const node = getView(last) ?? getView(s);
  if (node?.kind === "view") return `saved under a different View: '${node.label}' (${node.key})`;
  if (node) return `saved under a ${node.kind} id '${node.key}', not a View`;
  const byLabel = VIEWS.find((v) => v.kind === "view" && v.label === s);
  if (byLabel) return `saved under View label of '${byLabel.label}' (${byLabel.key})`;
  return `saved under unknown key '${s}' (renamed or deleted View?)`;
}

export async function legendLinksFor(
  viewKeyOrLabel: string,
  options: { limit?: number } = {},
): Promise<{ viewKey: string; aliases: string[]; shown: LegendLinkRow[]; hidden: LegendLinkRow[] }> {
  const limit = options.limit ?? 40; // keep in sync with Legend Card 2
  const input = (viewKeyOrLabel || "").trim();
  // Accept a label as well as a key.
  const resolved = getView(input) ?? VIEWS.find((v) => v.kind === "view" && v.label === input);
  const viewKey = resolved?.key ?? input;

  const { viewKeyAliases } = await import("@/pages/ScreenerLegend");
  const aliases = viewKeyAliases(viewKey);
  const records: StoredChartLinkRecord[] = await getAllChartLinkRecords();

  // Exactly what the Legend computes, but uncapped so we can see what the cap cuts.
  const matchedAll = findHistoricalChartLinks({
    records,
    viewKey,
    viewKeys: aliases,
    excludeToday: true,
    limit: 100000,
  });
  const matchedIds = new Set(matchedAll.map((m) => `${m.id}|${m.url}`));
  const shownIds = new Set(matchedAll.slice(0, limit).map((m) => `${m.id}|${m.url}`));

  const rowOf = (rec: StoredChartLinkRecord, status: "SHOWN" | "HIDDEN", reason: string): LegendLinkRow => {
    const p = parseChartRowKey(rec.rowKey || "");
    return {
      rowKey: rec.rowKey || rec.id,
      date: p.entryDate ?? "",
      symbol: (p.symbol ?? "").toUpperCase(),
      storedViewKey: (rec.viewKey || rec.lastViewKey || "").trim(),
      url: rec.url,
      status,
      reason,
    };
  };

  const shown: LegendLinkRow[] = [];
  const hidden: LegendLinkRow[] = [];
  const today = new Date().toISOString().slice(0, 10);
  const aliasSet = new Set(aliases.map((a) => a.trim()).filter(Boolean));
  const keyMatches = (stored: string) =>
    !!stored && (aliasSet.has(stored) || stored.split("::").some((seg) => seg && aliasSet.has(seg)));

  for (const rec of records) {
    const id = `${rec.id}|${rec.url}`;
    if (shownIds.has(id)) {
      shown.push(rowOf(rec, "SHOWN", "stored View key matches"));
      continue;
    }
    if (matchedIds.has(id)) {
      hidden.push(rowOf(rec, "HIDDEN", `matches, but cut by the ${limit}-newest limit`));
      continue;
    }
    const stored = (rec.viewKey || rec.lastViewKey || "").trim();
    const date = parseChartRowKey(rec.rowKey || "").entryDate;
    if (!rec.url) hidden.push(rowOf(rec, "HIDDEN", "no URL"));
    else if (!keyMatches(stored)) hidden.push(rowOf(rec, "HIDDEN", describeStoredKey(stored)));
    else if (date && date === today) hidden.push(rowOf(rec, "HIDDEN", "entry date is today (Legend excludes today)"));
    else hidden.push(rowOf(rec, "HIDDEN", "duplicate of another link (same URL, date and symbol)"));
  }

  const byDateDesc = (a: LegendLinkRow, b: LegendLinkRow) => b.date.localeCompare(a.date);
  shown.sort(byDateDesc);
  // Show the "other View" / "no key" reasons last, near-misses first.
  hidden.sort((a, b) => a.reason.localeCompare(b.reason) || byDateDesc(a, b));

  console.log(
    `[cprLegendLinksFor] View ${viewKey}${resolved ? ` ('${resolved.label}')` : " (not found in registry)"}: ` +
      `${shown.length} link(s) would show in Legend Card 2, ${hidden.length} stored link(s) would not.`,
  );
  console.log("[cprLegendLinksFor] keys/labels it matches on:", aliases);
  if (shown.length) {
    console.log("SHOWN:");
    console.table(shown.map(({ status: _s, reason: _r, ...rest }) => rest));
  }
  if (hidden.length) {
    const byReason = new Map<string, number>();
    for (const h of hidden) byReason.set(h.reason, (byReason.get(h.reason) ?? 0) + 1);
    console.log("NOT SHOWN, grouped by reason:");
    console.table(Array.from(byReason.entries()).map(([reason, count]) => ({ reason, count })));
    console.log("NOT SHOWN, per link (pass { limit } or filter by storedViewKey to narrow):");
    console.table(hidden.map(({ status: _s, ...rest }) => rest));
  }
  return { viewKey, aliases, shown, hidden };
}

if (typeof window !== "undefined") {
  (window as unknown as { cprLegendLinksFor?: typeof legendLinksFor }).cprLegendLinksFor = legendLinksFor;
}
