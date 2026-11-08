/**
 * Chart-link maintenance console commands. All of them are DRY RUN by default: they
 * report what they would do and write nothing until you pass { dryRun: false }.
 * They use this browser's Firestore login and local cache, same as
 * cprRepairChartLinks / cprLegendLinksFor.
 *
 * 1) Links that exist only in this browser (local cache, no Firestore doc) are
 *    invisible to cprRepairChartLinks, which reads Firestore only. Copy them up
 *    first, then run the repair so it can fix their View keys:
 *
 *      await cprSyncLocalChartLinks()                  // dry run: counts + list
 *      await cprSyncLocalChartLinks({ dryRun: false }) // create the missing docs
 *      await cprRepairChartLinks()                     // then re-run the repair
 *
 *    The sync only CREATES missing Firestore docs from the local cache. It never
 *    deletes anything and never changes a link's stored View key.
 *
 * 2) Links saved with no View key can't match any View. Attach the ones that
 *    genuinely belong to one View, judged by rebuilding the row's data on its
 *    date and asking the Backtest matcher which View it shows:
 *
 *      await cprAttachChartLinksToView("R1-B-B-BB-BB-L4U4-RH-GapAA-R4")
 *      await cprAttachChartLinksToView("R1-…", { dates: ["2026-09-03"] })
 *      await cprAttachChartLinksToView("R1-…", { dryRun: false })
 *
 *    Only links with NO View key are considered; anything already attributed
 *    to a View is left alone. A link is attached only when the Backtest would
 *    show exactly this View for that symbol/day. Pass { allowOverlap: true } to
 *    also attach when the row matches this View but the Backtest would show a
 *    different, earlier-ordered View for it (review the dry run first).
 *    The rowKeys it attached are saved to localStorage
 *    ("cpr_chart_links_attach_backup") so the change can be reviewed or undone.
 *
 * 3) For ALL key-less links at once: list which View(s) each one fully matches
 *    (read-only), then bulk-attach only the unambiguous ones (dry run first):
 *
 *      await cprSuggestViewsForChartLinks()            // read-only report
 *      await cprAttachSuggestedChartLinks()            // dry run
 *      await cprAttachSuggestedChartLinks({ dryRun: false })
 *
 */

import { collection, doc, getDocs, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { getDb, ensureSignedIn } from "@/lib/firebase";
import { VIEWS, getView } from "@/lib/views";
import {
  getAllChartLinkRecords,
  getLocalCache,
  parseChartRowKey,
  updateChartLinkViewKey,
} from "@/lib/chartLinks";

const CHART_LINKS_COLLECTION = "chartLinks";
const ATTACH_BACKUP_KEY = "cpr_chart_links_attach_backup";


/** Widen the Backtest's daily-candle window so the oldest link's date can be rebuilt. */
async function widenHistoryWindowFor(rowKeys: string[]): Promise<void> {
  try {
    const { setBacktestHistoryLimit } = await import("@/lib/backtest");
    const todayMs = Date.parse(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
    let maxDaysAgo = 0;
    for (const rk of rowKeys) {
      const d = parseChartRowKey(rk).entryDate;
      const ms = d ? Date.parse(d + "T00:00:00.000Z") : NaN;
      if (Number.isFinite(ms)) maxDaysAgo = Math.max(maxDaysAgo, Math.ceil((todayMs - ms) / 86_400_000));
    }
    setBacktestHistoryLimit(Math.min(1500, Math.max(10, maxDaysAgo + 6)));
  } catch (err) {
    console.warn("[chartLinkMaintenance] could not widen price-history window", err);
  }
}

/** Links saved with no View key, optionally narrowed by date / symbol. */
async function loadKeylessLinks(options: { dates?: string[]; symbols?: string[] }) {
  const dateFilter = options.dates?.length ? new Set(options.dates) : null;
  const symbolFilter = options.symbols?.length ? new Set(options.symbols.map((x) => x.toUpperCase())) : null;
  const records = await getAllChartLinkRecords();
  return records.filter((r) => {
    if (!r.url) return false;
    if ((r.viewKey || r.lastViewKey || "").trim()) return false;
    const p = parseChartRowKey(r.rowKey || "");
    if (!p.symbol || !p.source || !p.entryDate) return false;
    if (dateFilter && !dateFilter.has(p.entryDate)) return false;
    if (symbolFilter && !symbolFilter.has(p.symbol.toUpperCase())) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// 1) Local-only links -> Firestore
// ---------------------------------------------------------------------------

export type LocalSyncItem = { rowKey: string; storedViewKey: string; url: string };

export type LocalSyncReport = {
  dryRun: boolean;
  firestoreDocs: number;
  localEntries: number;
  alreadyInFirestore: number;
  localOnly: LocalSyncItem[];
  written: number;
  failed: string[];
};

export async function syncLocalChartLinksToFirestore(
  options: { dryRun?: boolean } = {},
): Promise<LocalSyncReport> {
  const dryRun = options.dryRun !== false;
  const uid = await ensureSignedIn();
  const db = getDb();
  const snapshot = await getDocs(query(collection(db, CHART_LINKS_COLLECTION), where("uid", "==", uid)));
  const remoteIds = new Set(snapshot.docs.map((d) => d.id));

  const local = getLocalCache();
  const localOnly: LocalSyncItem[] = [];
  const toWrite: { rowKey: string; url: string; savedAt: string; lastViewKey: string }[] = [];
  let alreadyInFirestore = 0;

  for (const [rowKey, link] of Object.entries(local)) {
    // Legacy "<viewKey>::<rowKey>" mirrors are not primary links.
    if (!link?.url || rowKey.includes("::")) continue;
    if (remoteIds.has(rowKey)) {
      alreadyInFirestore += 1;
      continue;
    }
    const storedViewKey = (link.lastViewKey || "").trim();
    localOnly.push({ rowKey, storedViewKey, url: link.url });
    toWrite.push({
      rowKey,
      url: link.url,
      savedAt: link.savedAt || new Date().toISOString(),
      lastViewKey: storedViewKey,
    });
  }

  const report: LocalSyncReport = {
    dryRun,
    firestoreDocs: remoteIds.size,
    localEntries: Object.keys(local).length,
    alreadyInFirestore,
    localOnly,
    written: 0,
    failed: [],
  };

  if (!dryRun) {
    for (const w of toWrite) {
      try {
        // merge:true so a doc created in the meantime is never clobbered wholesale.
        await setDoc(
          doc(db, CHART_LINKS_COLLECTION, w.rowKey),
          {
            url: w.url,
            savedAt: w.savedAt,
            uid,
            rowKey: w.rowKey,
            lastViewKey: w.lastViewKey,
            updatedAt: serverTimestamp(),
            syncedFromLocal: true,
          },
          { merge: true },
        );
        report.written += 1;
      } catch (err) {
        report.failed.push(w.rowKey);
        console.warn("[cprSyncLocalChartLinks] write failed", w.rowKey, err);
      }
    }
  }

  console.log(
    `[cprSyncLocalChartLinks] ${dryRun ? "DRY RUN" : "APPLIED"} — ${report.firestoreDocs} Firestore docs, ` +
      `${report.localEntries} local-cache entries: ${alreadyInFirestore} already in Firestore, ` +
      `${localOnly.length} local-only` +
      (dryRun ? "" : `; wrote ${report.written}, failed ${report.failed.length}`),
  );
  if (localOnly.length) console.table(localOnly);
  if (dryRun && localOnly.length) {
    console.log("[cprSyncLocalChartLinks] re-run with { dryRun: false } to create these in Firestore, then run cprRepairChartLinks().");
  }
  return report;
}

// ---------------------------------------------------------------------------
// 2) Attach key-less links to one View
// ---------------------------------------------------------------------------

export type AttachItem = { rowKey: string; symbol: string; date: string; reason?: string; backtestShows?: string };

export type AttachReport = {
  dryRun: boolean;
  viewKey: string;
  considered: number;
  willAttach: AttachItem[];
  skipped: AttachItem[];
  written: number;
  failed: string[];
};

export async function attachChartLinksToView(
  viewKeyOrLabel: string,
  options: { dryRun?: boolean; allowOverlap?: boolean; dates?: string[]; symbols?: string[] } = {},
): Promise<AttachReport> {
  const dryRun = options.dryRun !== false;
  const input = (viewKeyOrLabel || "").trim();
  const view = getView(input) ?? VIEWS.find((v) => v.kind === "view" && v.label === input);
  if (!view || view.kind !== "view") {
    throw new Error(`cprAttachChartLinksToView: '${input}' is not a View key or label.`);
  }

  const dateFilter = options.dates?.length ? new Set(options.dates) : null;
  const symbolFilter = options.symbols?.length ? new Set(options.symbols.map((s) => s.toUpperCase())) : null;

  const records = await getAllChartLinkRecords();
  const candidates = records.filter((r) => {
    if (!r.url) return false;
    if ((r.viewKey || r.lastViewKey || "").trim()) return false; // only links with NO View key
    const p = parseChartRowKey(r.rowKey || "");
    if (!p.symbol || !p.source || !p.entryDate) return false;
    if (dateFilter && !dateFilter.has(p.entryDate)) return false;
    if (symbolFilter && !symbolFilter.has(p.symbol.toUpperCase())) return false;
    return true;
  });

  const report: AttachReport = {
    dryRun,
    viewKey: view.key,
    considered: candidates.length,
    willAttach: [],
    skipped: [],
    written: 0,
    failed: [],
  };

  if (candidates.length) {
    const [{ categoryScanSymbolOnDate, levelCheckFullyMatches }, utils, panel, registry] =
      await Promise.all([
        import("@/lib/backtest"),
        import("@/pages/ScreenerUtils"),
        import("@/pages/BacktestPanel"),
        import("@/lib/views/registry"),
      ]);

    // Same scope the Backtest uses: the View's parent pattern (or every View).
    const scope = view.parentKey || "__all__";
    const passes = view.parentKey ? utils.passesPattern : () => true;

    await widenHistoryWindowFor(candidates.map((c) => c.rowKey));

    console.log(
      `[cprAttachChartLinksToView] checking ${candidates.length} key-less link(s) against '${view.label}' (${view.key}) ` +
        `under ${scope} — loads price history; may take a minute…`,
    );

    let next = 0;
    const worker = async () => {
      while (next < candidates.length) {
        const rec = candidates[next++];
        const p = parseChartRowKey(rec.rowKey);
        const item: AttachItem = { rowKey: rec.rowKey, symbol: p.symbol!, date: p.entryDate! };
        try {
          const row = await categoryScanSymbolOnDate(
            p.symbol!,
            p.source as Parameters<typeof categoryScanSymbolOnDate>[1],
            p.entryDate!,
            scope,
            passes,
          );
          if (!row) {
            report.skipped.push({
              ...item,
              reason: `row doesn't match ${scope} on that date, or price history couldn't be loaded (network/CORS)`,
            });
            continue;
          }
          const shown = panel.matchingViewDef(row.raw, scope);
          if (shown?.key === view.key) {
            report.willAttach.push({ ...item, backtestShows: shown.key });
            continue;
          }
          if (options.allowOverlap) {
            const ownCondition =
              (view.condition ? view.condition(row.raw) : false) || registry.passesView(row.raw, view.key);
            const fullOk = view.requireFullMatch === true ? levelCheckFullyMatches(row.raw, view.levelCheckDefs) : true;
            if (ownCondition && fullOk) {
              report.willAttach.push({ ...item, backtestShows: shown?.key ?? "(none)", reason: "overlap: matches this View too" });
              continue;
            }
          }
          report.skipped.push({
            ...item,
            backtestShows: shown?.key ?? "(none)",
            reason: shown ? "Backtest shows a different View for this row" : "no View under the scope matches this row",
          });
        } catch (err) {
          report.skipped.push({ ...item, reason: `could not rebuild row data: ${err instanceof Error ? err.message : String(err)}` });
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
  }

  const byDate = (a: AttachItem, b: AttachItem) => b.date.localeCompare(a.date) || a.symbol.localeCompare(b.symbol);
  report.willAttach.sort(byDate);
  report.skipped.sort(byDate);

  if (!dryRun && report.willAttach.length) {
    try {
      const prev = JSON.parse(localStorage.getItem(ATTACH_BACKUP_KEY) || "[]");
      localStorage.setItem(
        ATTACH_BACKUP_KEY,
        JSON.stringify([
          ...(Array.isArray(prev) ? prev : []),
          { at: new Date().toISOString(), viewKey: view.key, rowKeys: report.willAttach.map((a) => a.rowKey) },
        ]),
      );
    } catch {
      /* quota — the console table below still lists every rowKey */
    }
    for (const a of report.willAttach) {
      const ok = await updateChartLinkViewKey(a.rowKey, view.key);
      if (ok) report.written += 1;
      else report.failed.push(a.rowKey);
    }
  }

  console.log(
    `[cprAttachChartLinksToView] ${dryRun ? "DRY RUN" : "APPLIED"} — '${view.label}' (${view.key}): ` +
      `${report.considered} key-less link(s) checked, ${report.willAttach.length} ${dryRun ? "would attach" : "attached"}, ` +
      `${report.skipped.length} skipped` +
      (dryRun ? "" : `; wrote ${report.written}, failed ${report.failed.length}`),
  );
  if (report.willAttach.length) {
    console.log(dryRun ? "WOULD ATTACH:" : "ATTACHED:");
    console.table(report.willAttach);
  }
  if (report.skipped.length) {
    console.log("SKIPPED:");
    console.table(report.skipped);
  }
  if (dryRun && report.willAttach.length) {
    console.log("[cprAttachChartLinksToView] re-run with { dryRun: false } to attach the rows above.");
  }
  return report;
}


// ---------------------------------------------------------------------------
// 3) Suggest a View for every key-less link (read-only) + bulk attach
// ---------------------------------------------------------------------------

export type SuggestionStatus = "unique" | "overlap" | "partial-only" | "no-match" | "error";

export type ViewSuggestion = {
  rowKey: string;
  symbol: string;
  date: string;
  status: SuggestionStatus;
  /** View a bulk attach would use (set for "unique", and for "overlap" = Backtest's pick). */
  suggested?: string;
  /** Every View whose condition AND full 13/13 Level Check match this row on its date. */
  fullMatches: string[];
  /** The single View the Backtest panel would show for this row. */
  backtestShows?: string;
  reason?: string;
};

export type SuggestReport = {
  considered: number;
  suggestions: ViewSuggestion[];
  /** suggested View key -> rowKeys, for the links a bulk attach would claim ("unique" only). */
  byView: Record<string, string[]>;
};

async function computeViewSuggestions(options: { dates?: string[]; symbols?: string[] }): Promise<SuggestReport> {
  const candidates = await loadKeylessLinks(options);
  const report: SuggestReport = { considered: candidates.length, suggestions: [], byView: {} };
  if (!candidates.length) return report;

  const [{ categoryScanSymbolOnDate, levelCheckFullyMatches }, panel, registry] = await Promise.all([
    import("@/lib/backtest"),
    import("@/pages/BacktestPanel"),
    import("@/lib/views/registry"),
  ]);
  await widenHistoryWindowFor(candidates.map((c) => c.rowKey));

  const allViews = VIEWS.filter((v) => v.kind === "view");
  console.log(
    `[cprSuggestViewsForChartLinks] checking ${candidates.length} key-less link(s) against ${allViews.length} Views — ` +
      `loads price history; may take a few minutes…`,
  );

  let next = 0;
  const worker = async () => {
    while (next < candidates.length) {
      const rec = candidates[next++];
      const p = parseChartRowKey(rec.rowKey);
      const base = { rowKey: rec.rowKey, symbol: p.symbol!, date: p.entryDate! };
      try {
        // "__all__" scope = no pattern pre-filter, so every View is considered.
        const row = await categoryScanSymbolOnDate(
          p.symbol!,
          p.source as Parameters<typeof categoryScanSymbolOnDate>[1],
          p.entryDate!,
          "__all__",
          () => true,
        );
        if (!row) {
          report.suggestions.push({
            ...base,
            status: "no-match",
            fullMatches: [],
            reason: "row couldn't be rebuilt (price history couldn't be loaded, or network/CORS)",
          });
          continue;
        }
        const fullMatches: string[] = [];
        for (const v of allViews) {
          try {
            const own = (v.condition ? v.condition(row.raw) : false) || registry.passesView(row.raw, v.key);
            if (own && levelCheckFullyMatches(row.raw, v.levelCheckDefs)) fullMatches.push(v.key);
          } catch {
            /* a View whose predicate throws on this row simply doesn't match */
          }
        }
        const pick = panel.matchingViewDef(row.raw, "__all__")?.key;
        if (fullMatches.length === 1) {
          report.suggestions.push({ ...base, status: "unique", suggested: fullMatches[0], fullMatches, backtestShows: pick });
        } else if (fullMatches.length > 1) {
          report.suggestions.push({
            ...base,
            status: "overlap",
            suggested: pick && fullMatches.includes(pick) ? pick : fullMatches[0],
            fullMatches,
            backtestShows: pick,
            reason: `${fullMatches.length} Views fully match this row`,
          });
        } else if (pick) {
          report.suggestions.push({
            ...base,
            status: "partial-only",
            fullMatches,
            backtestShows: pick,
            reason: "only a partial Level Check match (not 13/13) — never auto-attached",
          });
        } else {
          report.suggestions.push({ ...base, status: "no-match", fullMatches, reason: "no View matches this row on that date" });
        }
      } catch (err) {
        report.suggestions.push({
          ...base,
          status: "error",
          fullMatches: [],
          reason: `could not rebuild row data: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);

  report.suggestions.sort((a, b) => b.date.localeCompare(a.date) || a.symbol.localeCompare(b.symbol));
  for (const sg of report.suggestions) {
    if (sg.status === "unique" && sg.suggested) (report.byView[sg.suggested] ??= []).push(sg.rowKey);
  }
  return report;
}

function printSuggestions(report: SuggestReport) {
  const counts = new Map<SuggestionStatus, number>();
  for (const sg of report.suggestions) counts.set(sg.status, (counts.get(sg.status) ?? 0) + 1);
  console.log(
    `[cprSuggestViewsForChartLinks] ${report.considered} key-less link(s): ` +
      (["unique", "overlap", "partial-only", "no-match", "error"] as SuggestionStatus[])
        .map((k) => `${counts.get(k) ?? 0} ${k}`)
        .join(", "),
  );
  const viewRows = Object.entries(report.byView)
    .map(([viewKey, rowKeys]) => ({ view: viewKey, label: getView(viewKey)?.label ?? "", links: rowKeys.length }))
    .sort((a, b) => b.links - a.links);
  if (viewRows.length) {
    console.log("UNIQUE matches, grouped by View (a bulk attach would claim exactly these):");
    console.table(viewRows);
  }
  console.log("PER LINK:");
  console.table(
    report.suggestions.map((sg) => ({
      date: sg.date,
      symbol: sg.symbol,
      status: sg.status,
      suggested: sg.suggested ?? "",
      backtestShows: sg.backtestShows ?? "",
      fullMatches: sg.fullMatches.length,
      reason: sg.reason ?? "",
    })),
  );
}

/**
 * READ-ONLY. For every link saved with no View key, rebuild its row on its date
 * and list which View(s) it fully matches. Writes nothing.
 *   await cprSuggestViewsForChartLinks()
 *   await cprSuggestViewsForChartLinks({ dates: ["2026-09-03"], symbols: ["KNCUSDT"] })
 */
export async function suggestViewsForChartLinks(
  options: { dates?: string[]; symbols?: string[] } = {},
): Promise<SuggestReport> {
  const report = await computeViewSuggestions(options);
  printSuggestions(report);
  if (Object.keys(report.byView).length) {
    console.log("[cprSuggestViewsForChartLinks] to attach the UNIQUE ones: await cprAttachSuggestedChartLinks()  (dry run) then { dryRun: false }");
  }
  return report;
}

/**
 * Bulk attach. DRY RUN by default. Attaches only links whose row fully matches
 * exactly ONE View ("unique"). Overlapping rows are attached to the Backtest's
 * pick only with { allowOverlap: true }; partial-only / no-match / error rows are
 * never touched. The attached rowKeys + Views are saved to
 * localStorage ("cpr_chart_links_attach_backup").
 *   await cprAttachSuggestedChartLinks()
 *   await cprAttachSuggestedChartLinks({ dryRun: false })
 */
export async function attachSuggestedChartLinks(
  options: { dryRun?: boolean; allowOverlap?: boolean; dates?: string[]; symbols?: string[] } = {},
): Promise<{ dryRun: boolean; willAttach: ViewSuggestion[]; left: ViewSuggestion[]; written: number; failed: string[] }> {
  const dryRun = options.dryRun !== false;
  const report = await computeViewSuggestions(options);
  const willAttach = report.suggestions.filter(
    (sg) => sg.suggested && (sg.status === "unique" || (options.allowOverlap === true && sg.status === "overlap")),
  );
  const left = report.suggestions.filter((sg) => !willAttach.includes(sg));
  const out = { dryRun, willAttach, left, written: 0, failed: [] as string[] };

  if (!dryRun && willAttach.length) {
    try {
      const prev = JSON.parse(localStorage.getItem(ATTACH_BACKUP_KEY) || "[]");
      localStorage.setItem(
        ATTACH_BACKUP_KEY,
        JSON.stringify([
          ...(Array.isArray(prev) ? prev : []),
          {
            at: new Date().toISOString(),
            viewKey: "(bulk)",
            items: willAttach.map((a) => ({ rowKey: a.rowKey, viewKey: a.suggested })),
          },
        ]),
      );
    } catch {
      /* quota — the console table below still lists every rowKey */
    }
    for (const a of willAttach) {
      const ok = await updateChartLinkViewKey(a.rowKey, a.suggested!);
      if (ok) out.written += 1;
      else out.failed.push(a.rowKey);
    }
  }

  console.log(
    `[cprAttachSuggestedChartLinks] ${dryRun ? "DRY RUN" : "APPLIED"} — ${report.considered} key-less link(s): ` +
      `${willAttach.length} ${dryRun ? "would attach" : "attached"}, ${left.length} left alone` +
      (dryRun ? "" : `; wrote ${out.written}, failed ${out.failed.length}`),
  );
  if (willAttach.length) {
    console.log(dryRun ? "WOULD ATTACH:" : "ATTACHED:");
    console.table(willAttach.map((a) => ({ date: a.date, symbol: a.symbol, view: a.suggested, status: a.status })));
  }
  if (left.length) {
    console.log("LEFT ALONE (review these by hand):");
    console.table(left.map((a) => ({ date: a.date, symbol: a.symbol, status: a.status, matches: a.fullMatches.length, reason: a.reason ?? "" })));
  }
  if (dryRun && willAttach.length) {
    console.log("[cprAttachSuggestedChartLinks] re-run with { dryRun: false } to apply.");
  }
  return out;
}

if (typeof window !== "undefined") {
  const w = window as unknown as {
    cprSyncLocalChartLinks?: typeof syncLocalChartLinksToFirestore;
    cprAttachChartLinksToView?: typeof attachChartLinksToView;
    cprSuggestViewsForChartLinks?: typeof suggestViewsForChartLinks;
    cprAttachSuggestedChartLinks?: typeof attachSuggestedChartLinks;
  };
  w.cprSyncLocalChartLinks = syncLocalChartLinksToFirestore;
  w.cprAttachChartLinksToView = attachChartLinksToView;
  w.cprSuggestViewsForChartLinks = suggestViewsForChartLinks;
  w.cprAttachSuggestedChartLinks = attachSuggestedChartLinks;
}
