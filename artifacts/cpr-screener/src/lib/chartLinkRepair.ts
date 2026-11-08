/**
 * One-time repair for chart-link `lastViewKey` values.
 *
 * Legend Card 2 cameras match a stored chart link by the View's KEY (or label).
 * Older saves may hold something else in `lastViewKey`: a View label, a Backtest
 * composite path ("category::pattern::view"), a category / pattern id, a key
 * recovered only from a legacy `viewKey::rowKey` doc id, or nothing at all.
 *
 * Run from the browser console of the deployed app (it uses this browser's
 * Firestore login, so it sees exactly the links this browser owns):
 *
 *   await cprRepairChartLinks()                    // dry run: report only, writes nothing
 *   await cprRepairChartLinks({ dryRun: false })   // apply the fixes it can resolve
 *
 * Anything it cannot resolve to a concrete View is only reported, never changed.
 * Before writing, the old values are saved to localStorage
 * ("cpr_chart_links_repair_backup") and stored on each doc as `previousLastViewKey`.
 */

import { collection, doc, getDocs, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { getDb, ensureSignedIn } from "@/lib/firebase";
import { VIEWS, getView } from "@/lib/views";
import { getLocalCache, saveToLocalCache, parseChartRowKey } from "@/lib/chartLinks";

const CHART_LINKS_COLLECTION = "chartLinks";
const BACKUP_KEY = "cpr_chart_links_repair_backup";

type Resolution =
  | { ok: true; key: string; how: string }
  | { ok: false; reason: string };

let labelIndex: Map<string, string[]> | null = null;
function viewKeysForLabel(label: string): string[] {
  if (!labelIndex) {
    labelIndex = new Map();
    for (const v of VIEWS) {
      if (v.kind !== "view") continue;
      const list = labelIndex.get(v.label) ?? [];
      list.push(v.key);
      labelIndex.set(v.label, list);
    }
  }
  return labelIndex.get(label) ?? [];
}

function resolveOne(token: string): Resolution | null {
  const t = token.trim();
  if (!t) return null;
  const byKey = getView(t);
  if (byKey?.kind === "view") return { ok: true, key: byKey.key, how: "already a View key" };
  const byLabel = viewKeysForLabel(t);
  if (byLabel.length === 1) return { ok: true, key: byLabel[0], how: "View label -> key" };
  if (byLabel.length > 1) return { ok: false, reason: "label matches several Views" };
  if (byKey) return { ok: false, reason: `${byKey.kind} id, not a View` };
  return null;
}

/** Resolve a stored value (plus any extra candidates) to a concrete View key. */
function resolveViewKey(stored: string, extraCandidates: string[]): Resolution {
  let firstFailure: Resolution | null = null;
  const consider = (r: Resolution | null) => {
    if (r && !r.ok && !firstFailure) firstFailure = r;
    return r && r.ok ? r : null;
  };

  const s = (stored || "").trim();
  if (s) {
    const direct = consider(resolveOne(s));
    if (direct) return direct;
    if (s.includes("::")) {
      const segs = s.split("::").filter(Boolean).reverse();
      for (const seg of segs) {
        const hit = consider(resolveOne(seg));
        if (hit) return { ok: true, key: hit.key, how: `composite path -> ${hit.how}` };
      }
    }
  }
  // Old "<key or label>:<target>" form, e.g. "B6-L4U4-pStepUp:R4". The suffix names
  // the target, so pick the View with that name whose key ends in "-<target>".
  // Only accept when exactly one View fits; never guess between several.
  const suffixed = s && !s.includes("::") ? s.match(/^(.+):([A-Za-z]{1,2}\d+)$/) : null;
  if (suffixed) {
    const [, base, target] = suffixed;
    const baseView = getView(base);
    const pool = baseView?.kind === "view" ? [baseView.key] : viewKeysForLabel(base);
    const hits = pool.filter((k) => k.toUpperCase().endsWith(`-${target.toUpperCase()}`));
    if (hits.length === 1) {
      return { ok: true, key: hits[0], how: `old '<name>:<target>' form -> View ending -${target}` };
    }
    if (!firstFailure) {
      firstFailure = {
        ok: false,
        reason: hits.length > 1
          ? `'${base}' with target ${target} matches several Views`
          : `no View named '${base}' ends with -${target}`,
      };
    }
  }
  for (const c of extraCandidates) {
    const hit = consider(resolveOne(c));
    if (hit) return { ok: true, key: hit.key, how: `legacy doc id -> ${hit.how}` };
  }
  if (firstFailure) return firstFailure;
  return { ok: false, reason: s ? "unknown key (renamed or deleted View?)" : "no lastViewKey" };
}

/**
 * Scope to re-grade a link against when its stored key is not a View:
 *  - "__all__"                         -> search every View
 *  - a pattern / category id (bare, or the last segment of a composite path)
 *  - an unknown key that starts with a real pattern id (renamed / deleted View)
 */
function inferScope(stored: string): string | null {
  const s = (stored || "").trim();
  if (!s) return null;
  if (s === "__all__") return s;
  const last = s.split("::").filter(Boolean).pop() || "";
  const node = getView(last);
  if (node) return node.kind === "view" ? null : last;
  const prefixed = VIEWS.filter((v) => v.kind !== "view" && v.key.length >= 6 && last.startsWith(v.key)).sort(
    (a, b) => b.key.length - a.key.length,
  );
  return prefixed[0]?.key ?? null;
}

/** Rebuild the row's data for that day and pick the View the Backtest panel would show. */
async function inferViewFromData(rowKey: string, scope: string): Promise<Resolution> {
  const parsed = parseChartRowKey(rowKey);
  if (!parsed.symbol || !parsed.source || !parsed.entryDate) {
    return { ok: false, reason: "row key has no symbol/source/date" };
  }
  try {
    const [{ categoryScanSymbolOnDate }, { passesPattern }, panel] = await Promise.all([
      import("@/lib/backtest"),
      import("@/pages/ScreenerUtils"),
      import("@/pages/BacktestPanel"),
    ]);
    const passes = scope === "__all__" ? () => true : passesPattern;
    const row = await categoryScanSymbolOnDate(
      parsed.symbol,
      parsed.source as Parameters<typeof categoryScanSymbolOnDate>[1],
      parsed.entryDate,
      scope,
      passes,
    );
    if (!row) return { ok: false, reason: `row doesn't match ${scope} on that date, or price history couldn't be loaded (network/CORS)` };
    const view = panel.matchingViewDef(row.raw, scope);
    if (!view || view.kind !== "view") return { ok: false, reason: `no View under ${scope} matches this row` };
    return { ok: true, key: view.key, how: `data match under ${scope}` };
  } catch (err) {
    return { ok: false, reason: `could not rebuild row data: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export type ChartLinkRepairItem = {
  rowKey: string;
  stored: string;
  newKey?: string;
  how?: string;
  reason?: string;
};

export type ChartLinkRepairReport = {
  dryRun: boolean;
  totalPrimaryDocs: number;
  alreadyOk: number;
  fixable: ChartLinkRepairItem[];
  unresolved: ChartLinkRepairItem[];
  written: number;
  localFixed: number;
};

export async function repairChartLinkViewKeys(
  options: { dryRun?: boolean; infer?: boolean } = {},
): Promise<ChartLinkRepairReport> {
  const dryRun = options.dryRun !== false; // default: dry run
  const infer = options.infer !== false; // default: also re-grade pattern-level links from row data
  const uid = await ensureSignedIn();
  const db = getDb();
  const snapshot = await getDocs(
    query(collection(db, CHART_LINKS_COLLECTION), where("uid", "==", uid)),
  );

  // Legacy mirror docs ("<viewKey>::<rowKey>") give extra view-key candidates per row.
  const mirrorKeysByRow = new Map<string, string[]>();
  for (const d of snapshot.docs) {
    const sep = d.id.lastIndexOf("::");
    if (sep < 0) continue;
    const list = mirrorKeysByRow.get(d.id.slice(sep + 2)) ?? [];
    list.push(d.id.slice(0, sep));
    mirrorKeysByRow.set(d.id.slice(sep + 2), list);
  }

  const report: ChartLinkRepairReport = {
    dryRun,
    totalPrimaryDocs: 0,
    alreadyOk: 0,
    fixable: [],
    unresolved: [],
    written: 0,
    localFixed: 0,
  };
  const pendingWrites: { id: string; rowKey: string; data: Record<string, unknown> }[] = [];
  const pendingInfer: { id: string; rowKey: string; stored: string; scope: string; data: Record<string, unknown> }[] = [];
  const resolvedByRow = new Map<string, string>(); // rowKey -> new View key (sync + inferred)

  for (const d of snapshot.docs) {
    if (d.id.includes("::")) continue; // primary (symbol-date) docs only
    const data = d.data();
    if (typeof data.url !== "string" || !data.url) continue;
    report.totalPrimaryDocs += 1;

    const rowKey = (typeof data.rowKey === "string" && data.rowKey) || d.id;
    const stored = typeof data.lastViewKey === "string" ? data.lastViewKey.trim() : "";
    const res = resolveViewKey(stored, mirrorKeysByRow.get(rowKey) ?? []);

    if (!res.ok) {
      const scope = infer ? inferScope(stored) : null;
      if (scope) {
        pendingInfer.push({ id: d.id, rowKey, stored, scope, data });
      } else {
        report.unresolved.push({ rowKey, stored, reason: res.reason });
      }
      continue;
    }
    if (res.key === stored) {
      report.alreadyOk += 1;
      continue;
    }
    report.fixable.push({ rowKey, stored, newKey: res.key, how: res.how });
    resolvedByRow.set(rowKey, res.key);
    pendingWrites.push({
      id: d.id,
      rowKey,
      data: {
        lastViewKey: res.key,
        previousLastViewKey: typeof data.previousLastViewKey === "string" ? data.previousLastViewKey : stored,
        viewKeyRepaired: true,
        updatedAt: serverTimestamp(),
      },
    });
  }

  // Pattern-level links: rebuild each row's data and pick the View the Backtest panel would show.
  if (pendingInfer.length) {
    console.log(`[cprRepairChartLinks] re-grading ${pendingInfer.length} pattern-level links from row data (loads price history; may take a minute)…`);
    // The Backtest panel keeps only ~10 days of daily candles by default and widens
    // that window per run. Do the same here, sized to the oldest link, or older
    // rows can't be rebuilt and wrongly look like "no longer matches".
    try {
      const { setBacktestHistoryLimit } = await import("@/lib/backtest");
      const todayMs = Date.parse(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
      let maxDaysAgo = 0;
      for (const p of pendingInfer) {
        const d = parseChartRowKey(p.rowKey).entryDate;
        const ms = d ? Date.parse(d + "T00:00:00.000Z") : NaN;
        if (Number.isFinite(ms)) maxDaysAgo = Math.max(maxDaysAgo, Math.ceil((todayMs - ms) / 86_400_000));
      }
      setBacktestHistoryLimit(Math.min(1500, Math.max(10, maxDaysAgo + 6)));
    } catch (err) {
      console.warn("[cprRepairChartLinks] could not widen price-history window", err);
    }
    let next = 0;
    const worker = async () => {
      while (next < pendingInfer.length) {
        const p = pendingInfer[next++];
        const res = await inferViewFromData(p.rowKey, p.scope);
        if (res.ok) {
          report.fixable.push({ rowKey: p.rowKey, stored: p.stored, newKey: res.key, how: res.how });
          resolvedByRow.set(p.rowKey, res.key);
          pendingWrites.push({
            id: p.id,
            rowKey: p.rowKey,
            data: {
              lastViewKey: res.key,
              previousLastViewKey: typeof p.data.previousLastViewKey === "string" ? p.data.previousLastViewKey : p.stored,
              viewKeyRepaired: true,
              updatedAt: serverTimestamp(),
            },
          });
        } else {
          report.unresolved.push({ rowKey: p.rowKey, stored: p.stored, reason: res.reason });
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
  }

  // Local cache (this browser) — same rules.
  const local = getLocalCache();
  const localFixes: { rowKey: string; link: { url: string; savedAt: string; lastViewKey: string } }[] = [];
  for (const [rowKey, link] of Object.entries(local)) {
    if (!link?.url || rowKey.includes("::")) continue;
    const stored = (link.lastViewKey || "").trim();
    const res: Resolution = resolvedByRow.has(rowKey)
      ? { ok: true, key: resolvedByRow.get(rowKey)!, how: "same as Firestore fix" }
      : resolveViewKey(stored, mirrorKeysByRow.get(rowKey) ?? []);
    if (res.ok && res.key !== stored) {
      localFixes.push({
        rowKey,
        link: { url: link.url, savedAt: link.savedAt || "", lastViewKey: res.key },
      });
    }
  }

  if (!dryRun) {
    try {
      localStorage.setItem(
        BACKUP_KEY,
        JSON.stringify({
          at: new Date().toISOString(),
          docs: report.fixable,
          local: localFixes.map((f) => ({ rowKey: f.rowKey, old: local[f.rowKey]?.lastViewKey ?? "" })),
        }),
      );
    } catch {
      /* quota — the report below still lists every old value */
    }
    for (const w of pendingWrites) {
      try {
        await setDoc(doc(db, CHART_LINKS_COLLECTION, w.id), w.data, { merge: true });
        report.written += 1;
      } catch (err) {
        console.warn("[cprRepairChartLinks] write failed", w.id, err);
      }
    }
    for (const f of localFixes) {
      saveToLocalCache(f.rowKey, f.link);
      report.localFixed += 1;
    }
  }

  // ---- console summary -------------------------------------------------------
  const unresolvedByStored = new Map<string, { count: number; reason: string }>();
  for (const u of report.unresolved) {
    const k = u.stored || "(empty)";
    const cur = unresolvedByStored.get(k) ?? { count: 0, reason: u.reason ?? "" };
    cur.count += 1;
    unresolvedByStored.set(k, cur);
  }
  console.log(
    `[cprRepairChartLinks] ${dryRun ? "DRY RUN" : "APPLIED"} — ${report.totalPrimaryDocs} chart links: ` +
      `${report.alreadyOk} already correct, ${report.fixable.length} fixable, ${report.unresolved.length} unresolved` +
      (dryRun ? "" : `; wrote ${report.written} docs, ${report.localFixed} local-cache entries`),
  );
  if (report.fixable.length) console.table(report.fixable);
  if (unresolvedByStored.size) {
    console.log("[cprRepairChartLinks] unresolved, grouped by stored lastViewKey:");
    console.table(
      Array.from(unresolvedByStored.entries()).map(([stored, v]) => ({ stored, count: v.count, reason: v.reason })),
    );
  }
  return report;
}

if (typeof window !== "undefined") {
  (window as unknown as { cprRepairChartLinks?: typeof repairChartLinkViewKeys }).cprRepairChartLinks =
    repairChartLinkViewKeys;
}
