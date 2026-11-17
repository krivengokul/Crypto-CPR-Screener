/**
 * Offline outcome grader.
 *
 * Replays chosen Views over past dates using the app's OWN backtest code
 * (src/lib/backtest.ts) and writes one row per signal: the features at
 * signal time plus the graded result (pass / fail / not-triggered / ...).
 * Candles come from local files via shimFetch, so this runs anywhere —
 * including Google Colab, where Binance's live API is blocked.
 *
 *   npx tsx tools/offline-grader/run.ts --data ./data --out ./out --days 90
 *
 * Options
 *   --data <dir>      folder written by download_klines.py      (default ./data)
 *   --out <dir>       where grades.jsonl / grades.csv go        (default ./out)
 *   --days <n>        how many entry dates to grade, ending at the newest
 *                     date that has a following day's candle    (default 90)
 *   --views <file>    JSON list of View keys           (default views.json here)
 *   --symbols <file>  JSON array of symbols     (default <data>/symbols.json)
 *   --limit-views <n> only the first n Views (quick smoke test)
 *
 * Resumable: finished (View, date) pairs are recorded in <out>/progress.json,
 * so an interrupted run continues where it stopped.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { installKlineShim } from "./shimFetch.ts";
import {
  backtestSymbolOnDate,
  prefetchHistories,
  getLastRunSkippedSymbols,
  type BacktestRow,
} from "../../artifacts/cpr-screener/src/lib/backtest.ts";
import { getView, passesView } from "../../artifacts/cpr-screener/src/lib/views/registry.ts";
import "../../artifacts/cpr-screener/src/lib/views.ts"; // populates the registry
import { shouldExcludeSymbol } from "../../artifacts/cpr-screener/src/lib/symbolFilters.ts";
import type { CPRResult } from "../../artifacts/cpr-screener/src/lib/cpr.ts";

const here = dirname(fileURLToPath(import.meta.url));

// ── args ────────────────────────────────────────────────────────────────
function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const dataDir = resolve(arg("data", "./data"));
const outDir = resolve(arg("out", "./out"));
const days = Math.max(1, parseInt(arg("days", "90"), 10));
const viewsFile = resolve(arg("views", join(here, "views.json")));
const symbolsFile = resolve(arg("symbols", join(dataDir, "symbols.json")));
const limitViews = parseInt(arg("limit-views", "0"), 10);

// ── quiet the app's console.warn spam; report counts at the end ─────────
const warnCounts = new Map<string, number>();
console.warn = (...a: unknown[]) => {
  const msg = a.map(String).join(" ").slice(0, 160);
  warnCounts.set(msg, (warnCounts.get(msg) ?? 0) + 1);
};

// ── helpers ─────────────────────────────────────────────────────────────
const DAY = 86_400_000;
const isoOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// Same check as BacktestPanel's passesPatternNoLadder: follow a Copy/Create
// View's conditionKey redirect, but do not apply the 13/13 Level Check gate.
function passesPatternNoLadder(r: CPRResult, pattern: string): boolean {
  const v = getView(pattern);
  if (!v) return false;
  if (v.conditionKey && v.conditionKey !== pattern) return passesPatternNoLadder(r, v.conditionKey);
  return passesView(r, pattern);
}

// Field names that can only be known during/after the signal day. They are
// kept out of the feature columns so a model can't learn from the future.
const NOT_A_FEATURE = /price|move|volume|strongbar|breakout|breakdown|upex|live|pd15m|consolidat|momentum|^change/i;

function flatten(prefix: string, obj: unknown, out: Record<string, number | string>, depth = 0) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (NOT_A_FEATURE.test(k)) continue;
    if (typeof v === "number") {
      if (Number.isFinite(v)) out[prefix + k] = v;
    } else if (typeof v === "boolean") {
      out[prefix + k] = v ? 1 : 0;
    } else if (typeof v === "string") {
      out[prefix + k] = v.slice(0, 60);
    } else if (v && typeof v === "object" && depth < 2) {
      flatten(`${prefix}${k}.`, v, out, depth + 1);
    }
  }
}

const csvCell = (v: unknown) => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// ── main ────────────────────────────────────────────────────────────────
async function main() {
  const shim = installKlineShim(dataDir);

  const views: { key: string; label: string; direction?: string }[] = JSON.parse(
    readFileSync(viewsFile, "utf8"),
  ).views;
  const selected = limitViews > 0 ? views.slice(0, limitViews) : views;
  for (const v of selected) {
    if (!getView(v.key)) throw new Error(`View key not found in registry: ${v.key} (${v.label})`);
  }

  const allSymbols: string[] = JSON.parse(readFileSync(symbolsFile, "utf8"));
  const symbols = allSymbols.filter((s) => !shouldExcludeSymbol(s));
  if (!symbols.length) throw new Error("No symbols to grade.");

  // Newest day we have a daily candle for, using the first symbol that has files.
  let latestMs = 0;
  for (const s of symbols) {
    const rows = shim.load(s, "1d");
    if (rows && rows.length) {
      latestMs = Math.max(latestMs, rows[rows.length - 1][0] as number);
      break;
    }
  }
  if (!latestMs) throw new Error(`No 1d candles found under ${dataDir}/klines/. Run download_klines.py first.`);
  // A signal needs the NEXT day's candle to be graded.
  const lastEntry = latestMs - DAY;
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) dates.push(isoOf(lastEntry - i * DAY)); // oldest first

  mkdirSync(outDir, { recursive: true });
  const jsonl = join(outDir, "grades.jsonl");
  const progressFile = join(outDir, "progress.json");
  const done = new Set<string>(existsSync(progressFile) ? JSON.parse(readFileSync(progressFile, "utf8")) : []);

  console.log(`Grading ${selected.length} Views × ${dates.length} dates (${dates[0]} → ${dates[dates.length - 1]}) × ${symbols.length} symbols`);
  if (done.size) console.log(`Resuming: ${done.size} (View,date) pairs already done`);

  await prefetchHistories(symbols, "binance");
  const skipped = getLastRunSkippedSymbols();
  if (skipped.length) console.log(`No daily candles for ${skipped.length} symbols: ${skipped.slice(0, 10).join(", ")}${skipped.length > 10 ? "…" : ""}`);

  const BATCH = 25;
  const t0 = Date.now();
  let totalRows = 0;
  for (const view of selected) {
    const target = getView(view.key)!;
    for (const date of dates) {
      const pairKey = `${view.key}|${date}`;
      if (done.has(pairKey)) continue;
      let missing15m = 0;
      const rows: BacktestRow[] = [];
      for (let i = 0; i < symbols.length; i += BATCH) {
        const res = await Promise.all(
          symbols.slice(i, i + BATCH).map((sym) =>
            backtestSymbolOnDate(
              sym, "binance", date, target, passesPatternNoLadder,
              () => missing15m++, () => missing15m++, () => missing15m++,
            ),
          ),
        );
        for (const r of res) if (r) rows.push(r);
      }
      const lines = rows.map((r) => {
        const f: Record<string, number | string> = {};
        flatten("", r.raw, f);
        return JSON.stringify({
          view_key: view.key,
          view_label: view.label,
          direction: target.direction ?? "",
          symbol: r.symbol,
          entry_date: r.entryDate,
          result: r.result,
          hit_date: r.hitDate,
          days_to_hit: r.daysToHit,
          entry_level: r.entryLevel,
          target_level: r.targetLevel,
          stoploss_level: r.stoplossLevel,
          compression_ratio: r.compressionRatio,
          // Entry-day close/change are only known at the END of the signal day:
          // kept for reference, but prefixed so a trainer excludes them.
          leak_close_price: r.closePrice,
          leak_change_pct: r.changePct,
          candles_missing: missing15m,
          f,
        });
      });
      if (lines.length) appendFileSync(jsonl, lines.join("\n") + "\n");
      totalRows += rows.length;
      done.add(pairKey);
      writeFileSync(progressFile, JSON.stringify([...done]));
    }
    const mins = ((Date.now() - t0) / 60000).toFixed(1);
    console.log(`  ✓ ${view.label}  (${mins} min elapsed, ${totalRows} rows so far)`);
  }

  // ── final CSV + summary ───────────────────────────────────────────────
  const all = existsSync(jsonl)
    ? readFileSync(jsonl, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
    : [];
  const featureKeys = [...new Set(all.flatMap((r) => Object.keys(r.f)))].sort();
  const metaKeys = [
    "view_key", "view_label", "direction", "symbol", "entry_date", "result", "hit_date",
    "days_to_hit", "entry_level", "target_level", "stoploss_level", "compression_ratio",
    "leak_close_price", "leak_change_pct", "candles_missing",
  ];
  const csv = [
    [...metaKeys, ...featureKeys.map((k) => `f_${k}`)].join(","),
    ...all.map((r) => [...metaKeys.map((k) => csvCell(r[k])), ...featureKeys.map((k) => csvCell(r.f[k]))].join(",")),
  ].join("\n");
  writeFileSync(join(outDir, "grades.csv"), csv + "\n");

  const byView = new Map<string, Record<string, number>>();
  for (const r of all) {
    const c = byView.get(r.view_label) ?? {};
    c[r.result] = (c[r.result] ?? 0) + 1;
    byView.set(r.view_label, c);
  }
  const summary = [...byView.entries()].map(([label, c]) => {
    const graded = (c.pass ?? 0) + (c.fail ?? 0);
    return {
      view: label,
      signals: Object.values(c).reduce((a, b) => a + b, 0),
      pass: c.pass ?? 0,
      fail: c.fail ?? 0,
      not_triggered: c["not-triggered"] ?? 0,
      other: (c["insufficient-data"] ?? 0) + (c["invalid-target"] ?? 0),
      hit_rate: graded ? +((c.pass ?? 0) / graded).toFixed(3) : null,
    };
  });
  writeFileSync(join(outDir, "summary.json"), JSON.stringify(summary, null, 2));

  console.log("\n=== Summary (hit rate = pass / (pass + fail); not-triggered excluded) ===");
  console.table(summary);
  console.log(`Rows: ${all.length}   Feature columns: ${featureKeys.length}   → ${join(outDir, "grades.csv")}`);
  if (shim.stats.unknownSymbol.size) console.log(`Missing candle files for: ${[...shim.stats.unknownSymbol].slice(0, 10).join(", ")}`);
  if (shim.stats.blockedUrls.size) console.log("Blocked non-kline requests (should be none):", Object.fromEntries(shim.stats.blockedUrls));
  if (warnCounts.size) {
    console.log("App warnings (count):");
    [...warnCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).forEach(([m, n]) => console.log(`  ${n}×  ${m}`));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
