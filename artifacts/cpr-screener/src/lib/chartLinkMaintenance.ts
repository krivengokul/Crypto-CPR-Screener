/**
 * Chart-link maintenance console commands. Both are DRY RUN by default: they
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
    const [{ categoryScanSymbolOnDate, setBacktestHistoryLimit, levelCheckFullyMatches }, utils, panel, registry] =
      await Promise.all([
        import("@/lib/backtest"),
        import("@/pages/ScreenerUtils"),
        import("@/pages/BacktestPanel"),
        import("@/lib/views/registry"),
      ]);

    // Same scope the Backtest uses: the View's parent pattern (or every View).
    const scope = view.parentKey || "__all__";
    const passes = view.parentKey ? utils.passesPattern : () => true;

    // Widen the daily-candle window to reach the oldest link (as cprRepairChartLinks does).
    try {
      const todayMs = Date.parse(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
      let maxDaysAgo = 0;
      for (const c of candidates) {
        const d = parseChartRowKey(c.rowKey).entryDate;
        const ms = d ? Date.parse(d + "T00:00:00.000Z") : NaN;
        if (Number.isFinite(ms)) maxDaysAgo = Math.max(maxDaysAgo, Math.ceil((todayMs - ms) / 86_400_000));
      }
      setBacktestHistoryLimit(Math.min(1500, Math.max(10, maxDaysAgo + 6)));
    } catch (err) {
      console.warn("[cprAttachChartLinksToView] could not widen price-history window", err);
    }

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

if (typeof window !== "undefined") {
  const w = window as unknown as {
    cprSyncLocalChartLinks?: typeof syncLocalChartLinksToFirestore;
    cprAttachChartLinksToView?: typeof attachChartLinksToView;
  };
  w.cprSyncLocalChartLinks = syncLocalChartLinksToFirestore;
  w.cprAttachChartLinksToView = attachChartLinksToView;
}
