// Writes a views file with Views that (a) have entry/target/stop and (b) matched
// at least once on the synthetic data — to exercise the grading path end to end.
import { installKlineShim } from "../shimFetch.ts";
import { reconstructCPRForDate, prefetchHistories } from "../../../artifacts/cpr-screener/src/lib/backtest.ts";
import { VIEWS, passesView } from "../../../artifacts/cpr-screener/src/lib/views/registry.ts";
import "../../../artifacts/cpr-screener/src/lib/views.ts";
import { writeFileSync } from "node:fs";
installKlineShim(process.argv[2]);
const syms = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "ADAUSDT", "XRPUSDT", "DOGEUSDT"];
await prefetchHistories(syms, "binance");
const hits = new Map<string, any>();
for (const s of syms) for (let d = 1; d <= 14; d++) {
  const r = await reconstructCPRForDate(s, "binance", `2026-11-${String(d).padStart(2, "0")}`);
  if (!r) continue;
  for (const v of VIEWS as any[]) {
    if (v.kind !== "view" || !v.getTarget || !v.getEntry || !v.getStoploss) continue;
    let ok = false; try { ok = passesView(r.result, v.key); } catch {}
    if (ok && !hits.has(v.key)) hits.set(v.key, { key: v.key, label: v.label, direction: v.direction });
  }
}
writeFileSync(process.argv[3], JSON.stringify({ views: [...hits.values()] }, null, 2));
console.log("gradable Views that matched:", hits.size, [...hits.values()].map((h) => h.label).join(", "));
