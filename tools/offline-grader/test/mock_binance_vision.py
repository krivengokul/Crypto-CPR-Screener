#!/usr/bin/env python3
"""
Local stand-in for data.binance.vision, for testing the pipeline offline.

Serves synthetic (random-walk) futures klines in the same URL layout and the
same zip/CSV format as the real host (including the header row), plus an
S3-style symbol listing. Daily files exist up to 2026-11-15, like the real
host lagging by a day or two.

    python mock_binance_vision.py 8765
"""
import csv
import datetime as dt
import io
import random
import re
import sys
import zipfile
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT", "AVAXUSDT", "USDCUSDT", "BTCUSDT_241227"]
LAST_DAY = dt.date(2026, 11, 15)
FIRST_DAY = dt.date(2026, 5, 1)
HEADER = ["open_time", "open", "high", "low", "close", "volume", "close_time", "quote_volume", "count",
          "taker_buy_volume", "taker_buy_quote_volume", "ignore"]
M15 = 15 * 60 * 1000


def ms(d):
    return int(dt.datetime(d.year, d.month, d.day, tzinfo=dt.timezone.utc).timestamp() * 1000)


def build(symbol):
    rnd = random.Random(symbol)
    price = {"BTCUSDT": 90000, "ETHUSDT": 3200, "SOLUSDT": 160}.get(symbol, 1.0 + rnd.random() * 5)
    vol_scale = 1000 * (1 + rnd.random() * 50)
    rows15 = []
    t = ms(FIRST_DAY)
    end = ms(LAST_DAY + dt.timedelta(days=1))
    while t < end:
        o = price
        # random walk with occasional bursts so CPR shapes vary
        step = rnd.gauss(0, 0.0035) + (rnd.gauss(0, 0.012) if rnd.random() < 0.03 else 0)
        c = o * (1 + step)
        h = max(o, c) * (1 + abs(rnd.gauss(0, 0.0015)))
        l = min(o, c) * (1 - abs(rnd.gauss(0, 0.0015)))
        v = vol_scale * (0.5 + rnd.random())
        rows15.append([t, o, h, l, c, v])
        price = c
        t += M15
    return rows15


def fmt(row):
    t, o, h, l, c, v = row[:6]
    return [t, f"{o:.8g}", f"{h:.8g}", f"{l:.8g}", f"{c:.8g}", f"{v:.4f}", t + 1, f"{v * c:.2f}", 100, f"{v / 2:.4f}", f"{v * c / 2:.2f}", 0]


def aggregate_daily(rows15):
    days = {}
    for r in rows15:
        days.setdefault(r[0] - r[0] % 86_400_000, []).append(r)
    out = []
    for t, rs in sorted(days.items()):
        out.append([t, rs[0][1], max(x[2] for x in rs), min(x[3] for x in rs), rs[-1][4], sum(x[5] for x in rs)])
    return out


CACHE = {}


def series(symbol, interval):
    if symbol not in CACHE:
        r15 = build(symbol)
        CACHE[symbol] = {"15m": r15, "1d": aggregate_daily(r15)}
    return CACHE[symbol][interval]


def make_zip(name, rows):
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(HEADER)
    for r in rows:
        w.writerow(fmt(r))
    zb = io.BytesIO()
    with zipfile.ZipFile(zb, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr(name.replace(".zip", ".csv"), buf.getvalue())
    return zb.getvalue()


FILE_RE = re.compile(r"^/data/futures/um/(daily|monthly)/klines/([A-Z0-9_]+)/(1d|15m)/\2-\3-([0-9-]+)\.zip$")


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, code, body=b"", ctype="application/octet-stream"):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urlparse(self.path)
        if u.path == "/list":
            q = parse_qs(u.query)
            if q.get("prefix", [""])[0] != "data/futures/um/daily/klines/":
                return self._send(200, b"<ListBucketResult/>", "application/xml")
            cps = "".join(f"<CommonPrefixes><Prefix>data/futures/um/daily/klines/{s}/</Prefix></CommonPrefixes>" for s in SYMBOLS)
            xml = (f'<?xml version="1.0" encoding="UTF-8"?><ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">'
                   f"<IsTruncated>false</IsTruncated>{cps}</ListBucketResult>")
            return self._send(200, xml.encode(), "application/xml")
        m = FILE_RE.match(u.path)
        if not m or m.group(2) not in SYMBOLS:
            return self._send(404, b"<Error><Code>NoSuchKey</Code></Error>", "application/xml")
        kind, sym, interval, stamp = m.groups()
        rows = series(sym, interval)
        try:
            if kind == "daily":
                d = dt.date.fromisoformat(stamp)
                lo, hi = ms(d), ms(d + dt.timedelta(days=1))
            else:
                y, mo = map(int, stamp.split("-"))
                d = dt.date(y, mo, 1)
                nxt = dt.date(y + (mo == 12), mo % 12 + 1, 1)
                # like the real host, monthly files exist only for completed months
                if nxt > LAST_DAY:
                    return self._send(404, b"<Error/>", "application/xml")
                lo, hi = ms(d), ms(nxt)
        except ValueError:
            return self._send(404, b"<Error/>", "application/xml")
        sel = [r for r in rows if lo <= r[0] < hi]
        if not sel:
            return self._send(404, b"<Error/>", "application/xml")
        self._send(200, make_zip(f"{sym}-{interval}-{stamp}.zip", sel))


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    HTTPServer(("127.0.0.1", port), H).serve_forever()
