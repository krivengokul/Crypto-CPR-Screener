#!/usr/bin/env python3
"""
Download Binance USDT-M futures candles from the public data files
(data.binance.vision) — the live API is blocked from US cloud servers, but
these static files are not.

Writes, for the top-N most traded symbols (plus any --include symbols):
    <out>/klines/<SYMBOL>/1d.csv     daily candles (CPR levels)
    <out>/klines/<SYMBOL>/15m.csv    15-minute candles (candle checks)
    <out>/symbols.json               the chosen symbols
    <out>/meta.json                  newest date available, range, counts

Usage:
    python download_klines.py --out data --days 90 --top 50
    python download_klines.py --out data --days 30 --top 10 --include BTCUSDT ETHUSDT

Only Python's standard library plus `requests` is needed (Colab has both).
"""
import argparse
import csv
import datetime as dt
import io
import json
import re
import sys
import xml.etree.ElementTree as ET
import zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

DEFAULT_BASE = "https://data.binance.vision"
DEFAULT_LIST = "https://s3-ap-northeast-1.amazonaws.com/data.binance.vision"
DAY_MS = 86_400_000
UM = "data/futures/um"
# USD-pegged coins never form meaningful CPR patterns (same idea as the app's
# symbolFilters.ts); skip them so they don't take up a top-N slot.
STABLE_BASES = {"USDC", "FDUSD", "TUSD", "USDP", "USDE", "USDS", "DAI", "PYUSD", "USD1",
                "EURI", "AEUR", "BFUSD", "FRAX", "GUSD", "LUSD", "USDD", "RLUSD"}

session = requests.Session()
session.headers["User-Agent"] = "cpr-offline-grader"


def get(url, retries=3, **kw):
    """GET with small retry; returns the Response (any status) or None on network failure."""
    for i in range(retries):
        try:
            r = session.get(url, timeout=40, **kw)
            if r.status_code >= 500 or r.status_code == 429:
                continue
            return r
        except requests.RequestException:
            continue
    return None


def list_symbols(list_url):
    """All `<BASE>USDT` perpetual symbols that have daily kline files."""
    prefix = f"{UM}/daily/klines/"
    symbols, marker = [], ""
    while True:
        url = f"{list_url}?delimiter=/&prefix={prefix}&max-keys=1000" + (f"&marker={marker}" if marker else "")
        r = get(url)
        if r is None or r.status_code != 200:
            sys.exit(f"Could not list symbols from {list_url} (status {getattr(r, 'status_code', 'n/a')})")
        root = ET.fromstring(r.content)
        ns = {"s": root.tag.split("}")[0].strip("{")} if root.tag.startswith("{") else {}
        q = (lambda t: f"s:{t}") if ns else (lambda t: t)
        for cp in root.findall(q("CommonPrefixes"), ns):
            p = cp.find(q("Prefix"), ns).text  # data/futures/um/daily/klines/BTCUSDT/
            symbols.append(p.rstrip("/").split("/")[-1])
        trunc = root.find(q("IsTruncated"), ns)
        nxt = root.find(q("NextMarker"), ns)
        if trunc is not None and trunc.text == "true" and nxt is not None:
            marker = nxt.text
        else:
            break
    return sorted({s for s in symbols
                   if re.fullmatch(r"[A-Z0-9]+USDT", s) and s[:-4] not in STABLE_BASES})


def parse_zip(content):
    """Rows of a data.binance.vision zip as lists of strings; header row skipped."""
    z = zipfile.ZipFile(io.BytesIO(content))
    text = z.read(z.namelist()[0]).decode()
    rows = []
    for row in csv.reader(io.StringIO(text)):
        if not row or not row[0].strip().isdigit():
            continue  # header
        # Newer spot files use microseconds; futures are milliseconds. Normalise defensively.
        if int(row[0]) > 10**14:
            row[0] = str(int(row[0]) // 1000)
            row[6] = str(int(row[6]) // 1000)
        rows.append(row[:12])
    return rows


def fetch_zip(base, kind, symbol, interval, stamp):
    url = f"{base}/{UM}/{kind}/klines/{symbol}/{interval}/{symbol}-{interval}-{stamp}.zip"
    r = get(url)
    if r is None or r.status_code != 200:
        return None
    try:
        return parse_zip(r.content)
    except (zipfile.BadZipFile, KeyError):
        return None  # e.g. an error page served with 200


def month_days(year, month):
    d = dt.date(year, month, 1)
    while d.month == month:
        yield d
        d += dt.timedelta(days=1)


def fetch_range(base, symbol, interval, start, end):
    """Candles for [start, end] (dates). Whole completed months use the monthly file; the rest daily files."""
    rows = []
    cur = dt.date(start.year, start.month, 1)
    while cur <= end:
        days = [d for d in month_days(cur.year, cur.month) if start <= d <= end]
        month_full = len(days) == len(list(month_days(cur.year, cur.month))) and cur.replace(day=28) < end
        got = None
        if month_full:
            got = fetch_zip(base, "monthly", symbol, interval, f"{cur.year}-{cur.month:02d}")
        if got is not None:
            rows += got
        else:
            for d in days:
                part = fetch_zip(base, "daily", symbol, interval, d.isoformat())
                if part:
                    rows += part
        cur = (cur.replace(day=28) + dt.timedelta(days=4)).replace(day=1)
    return rows


def latest_available(base, probe_symbol="BTCUSDT"):
    """Newest date whose daily 1d file exists (files lag by about a day)."""
    d = dt.datetime.now(dt.timezone.utc).date()
    for _ in range(10):
        if fetch_zip(base, "daily", probe_symbol, "1d", d.isoformat()):
            return d
        d -= dt.timedelta(days=1)
    sys.exit("Could not find a recent daily file for BTCUSDT — is the data host reachable?")


def avg_quote_volume(base, symbol, end, n=7):
    vols = []
    for i in range(n):
        rows = fetch_zip(base, "daily", symbol, "1d", (end - dt.timedelta(days=i)).isoformat())
        if rows:
            vols.append(float(rows[0][7]))
    return sum(vols) / len(vols) if vols else 0.0


def write_csv(path, rows, start, end):
    lo = int(dt.datetime.combine(start, dt.time(), dt.timezone.utc).timestamp() * 1000)
    hi = int(dt.datetime.combine(end + dt.timedelta(days=1), dt.time(), dt.timezone.utc).timestamp() * 1000)
    seen = {}
    for r in rows:
        t = int(r[0])
        if lo <= t < hi:
            seen[t] = r
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        for t in sorted(seen):
            w.writerow(seen[t])
    return len(seen)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="data")
    ap.add_argument("--days", type=int, default=90, help="entry dates to grade (history needed is a bit more)")
    ap.add_argument("--top", type=int, default=50, help="top-N symbols by recent USDT volume")
    ap.add_argument("--include", nargs="*", default=["BTCUSDT", "ETHUSDT", "XAUUSDT", "XAUTUSDT"],
                    help="always include these if they exist")
    ap.add_argument("--base", default=DEFAULT_BASE)
    ap.add_argument("--list-url", default=DEFAULT_LIST)
    ap.add_argument("--workers", type=int, default=24)
    a = ap.parse_args()
    out = Path(a.out)

    end = latest_available(a.base)
    # +12: the app needs a few earlier days to build CPR levels; +1 margin.
    start = end - dt.timedelta(days=a.days + 12)
    print(f"Newest available day: {end}. Downloading {start} → {end}")

    universe = list_symbols(a.list_url)
    print(f"{len(universe)} USDT perpetuals listed")

    print("Ranking by average daily USDT volume (last 7 days)…")
    with ThreadPoolExecutor(a.workers) as ex:
        vols = dict(zip(universe, ex.map(lambda s: avg_quote_volume(a.base, s, end), universe)))
    ranked = [s for s, v in sorted(vols.items(), key=lambda kv: -kv[1]) if v > 0]
    chosen = ranked[: a.top]
    for s in a.include:
        if s in universe and s not in chosen:
            chosen.append(s)
    print(f"Chosen {len(chosen)} symbols: {', '.join(chosen[:12])}{'…' if len(chosen) > 12 else ''}")

    def job(args):
        sym, interval = args
        rows = fetch_range(a.base, sym, interval, start, end)
        n = write_csv(out / "klines" / sym / f"{interval}.csv", rows, start, end)
        return sym, interval, n

    jobs = [(s, i) for s in chosen for i in ("1d", "15m")]
    counts = {}
    with ThreadPoolExecutor(a.workers) as ex:
        for k, (sym, interval, n) in enumerate(ex.map(job, jobs), 1):
            counts[f"{sym}/{interval}"] = n
            if k % 20 == 0 or k == len(jobs):
                print(f"  {k}/{len(jobs)} files")

    usable = [s for s in chosen if counts.get(f"{s}/1d", 0) >= 5]
    (out / "symbols.json").write_text(json.dumps(usable))
    (out / "meta.json").write_text(json.dumps({
        "latest_date": end.isoformat(), "start_date": start.isoformat(),
        "symbols": len(usable), "rows": counts,
    }))
    empty = [k for k, n in counts.items() if n == 0]
    print(f"Done. {len(usable)} symbols usable. Files with no data: {len(empty)}" + (f" (e.g. {empty[:5]})" if empty else ""))


if __name__ == "__main__":
    main()
