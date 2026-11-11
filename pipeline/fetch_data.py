"""Fetch Swedish rates and inflation from official sources and write data/rates.json.

Sources (free, official):
  * Sveriges Riksbank SWEA API: policy rate, Treasury bills, government bond yields
  * Statistics Sweden (SCB) PxWebApi 2: CPIF, CPIF-XE and banks' new mortgage rates

The Riksbank API allows only a handful of requests per minute without a key, so series are
fetched one at a time with a pause, and HTTP 429 responses are retried after Retry-After.
The output is validated before it is written, so a bad fetch never replaces good data.

Standard library only, so the scheduled job needs no installs.

    python pipeline/fetch_data.py            # writes data/rates.json
    python pipeline/fetch_data.py --check    # fetch + validate, don't write
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

START = "2005-01-01"
OUT = Path(__file__).resolve().parents[1] / "data" / "rates.json"

# key -> (Riksbank SWEA series id, label, maturity in years)
RIKSBANK = {
    "policy": ("SECBREPOEFF", "Riksbank policy rate", 0.0),
    "tb1m": ("SETB1MBENCHC", "Treasury bill 1 month", 1 / 12),
    "tb3m": ("SETB3MBENCH", "Treasury bill 3 months", 0.25),
    "tb6m": ("SETB6MBENCH", "Treasury bill 6 months", 0.5),
    "gb2y": ("SEGVB2YC", "Government bond 2 years", 2.0),
    "gb5y": ("SEGVB5YC", "Government bond 5 years", 5.0),
    "gb7y": ("SEGVB7YC", "Government bond 7 years", 7.0),
    "gb10y": ("SEGVB10YC", "Government bond 10 years", 10.0),
}

SCB = "https://statistikdatabasen.scb.se/api/v2/tables/{table}/data"
SWEA = "https://api.riksbank.se/swea/v1/Observations/{series}/{start}/{end}"
UA = {"User-Agent": "swedish-rates-monitor (github.com/danielengerby1/swedish-rates-monitor)"}


def get_json(url: str, retries: int = 6, sleep=time.sleep) -> object:
    """GET a JSON document, waiting out rate limits (429) and retrying transient errors."""
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429 or e.code >= 500:
                wait = int(e.headers.get("Retry-After") or 30) if e.code == 429 else 10 * (attempt + 1)
                print(f"  HTTP {e.code}, waiting {wait}s ({url[:80]})", file=sys.stderr)
                sleep(wait + 1)
                continue
            raise
        except (urllib.error.URLError, TimeoutError) as e:
            print(f"  {e}, retrying", file=sys.stderr)
            sleep(10 * (attempt + 1))
    raise RuntimeError(f"giving up on {url}")


def fetch_riksbank(end: str, pause: float = 13.0) -> dict[str, dict[str, float]]:
    out = {}
    for i, (key, (series, label, _)) in enumerate(RIKSBANK.items()):
        if i:
            time.sleep(pause)  # stay under ~5 requests/minute
        rows = get_json(SWEA.format(series=series, start=START, end=end))
        out[key] = {r["date"]: float(r["value"]) for r in rows if r.get("value") is not None}
        print(f"  {key:6s} {series:13s} {len(out[key]):5d} obs, last {max(out[key]) if out[key] else '-'}")
    return out


def scb_query(table: str, codes: dict[str, str]) -> dict:
    params = {"lang": "en", "outputFormat": "json-stat2", **{f"valueCodes[{k}]": v for k, v in codes.items()}}
    return get_json(SCB.format(table=table) + "?" + urllib.parse.urlencode(params))


def jsonstat_records(js: dict) -> list[tuple[dict[str, str], float | None]]:
    """Flatten a JSON-stat 2.0 dataset into (coordinates, value) pairs."""
    ids, sizes = js["id"], js["size"]
    cats = []
    for d in ids:
        idx = js["dimension"][d]["category"]["index"]
        keys = idx if isinstance(idx, list) else sorted(idx, key=idx.get)
        cats.append(keys)
    values = js["value"]
    out = []
    for flat, v in enumerate(values):
        coord, rem = {}, flat
        for d, keys, n in zip(reversed(ids), reversed(cats), reversed(sizes)):
            coord[d] = keys[rem % n]
            rem //= n
        out.append((coord, None if v is None else float(v)))
    return out


def month_to_iso(m: str) -> str:
    return f"{m[:4]}-{m[5:7]}"  # 2026M09 -> 2026-09


def fetch_scb() -> dict[str, dict[str, float]]:
    out: dict[str, dict[str, float]] = {}
    for key, table, code in (("kpif", "TAB6590", "000007ZM"), ("kpifxe", "TAB6593", "000007ZV")):
        recs = jsonstat_records(scb_query(table, {"ContentsCode": code, "Tid": "*"}))
        out[key] = {month_to_iso(c["Tid"]): v for c, v in recs if v is not None and c["Tid"] >= START[:4]}
        print(f"  {key:6s} {table} {len(out[key])} months, last {max(out[key])}")

    # Banks' rates on new and renegotiated mortgages, volume-weighted across houses and
    # tenant-owner apartments: floating (up to 3 months), 3-5 years fixed, and all fixations.
    fix = {"1.1.1": "mortgageFloating", "1.1.2.2.2": "mortgage3to5y", "1": "mortgageAll"}
    recs = jsonstat_records(scb_query("TAB6535", {
        "MFIsakerhet": "001,002", "Avtal": "0100", "RantebindningFM5001": ",".join(fix),
        "ContentsCode": "000007VV,000007VW", "Tid": "*",
    }))
    acc: dict[tuple[str, str], list[float]] = {}
    cell: dict[tuple, dict[str, float]] = {}
    for c, v in recs:
        if v is None:
            continue
        k = (c["RantebindningFM5001"], c["Tid"], c["MFIsakerhet"])
        cell.setdefault(k, {})[c["ContentsCode"]] = v
    for (f, t, _), d in cell.items():
        if "000007VV" in d and "000007VW" in d and d["000007VW"] > 0:
            a = acc.setdefault((f, t), [0.0, 0.0])
            a[0] += d["000007VV"] * d["000007VW"]
            a[1] += d["000007VW"]
    for f, key in fix.items():
        out[key] = {month_to_iso(t): round(s / w, 3) for (ff, t), (s, w) in acc.items() if ff == f and w > 0}
        print(f"  {key:16s} {len(out[key])} months, last {max(out[key]) if out[key] else '-'}")
    return out


def build(daily: dict[str, dict[str, float]], monthly: dict[str, dict[str, float]], today: str) -> dict:
    """Align series on shared date/month axes. Daily gaps (a series not published that day)
    are forward-filled for at most 5 days; longer gaps stay null so charts show a break."""
    dates = sorted({d for s in daily.values() for d in s})
    series = {}
    for key, obs in daily.items():
        col, last, age = [], None, 0
        for d in dates:
            if d in obs:
                last, age = obs[d], 0
            else:
                age += 1
            col.append(last if last is not None and age <= 5 else None)
        series[key] = col
    months = sorted({m for s in monthly.values() for m in s})
    return {
        "updated": today,
        "sources": {
            "riksbank": "Sveriges Riksbank, SWEA API (api.riksbank.se)",
            "scb": "Statistics Sweden (SCB), PxWebApi 2: TAB6590, TAB6593, TAB6535",
        },
        "meta": {k: {"series": s, "label": lab, "maturity": m} for k, (s, lab, m) in RIKSBANK.items()},
        "daily": {"dates": dates, "series": series},
        "monthly": {"months": months, "series": {k: [v.get(m) for m in months] for k, v in monthly.items()}},
    }


def validate(data: dict, today: dt.date) -> list[str]:
    """Return a list of problems; empty means the data is safe to publish."""
    problems = []
    d = data["daily"]
    if len(d["dates"]) < 2000:
        problems.append(f"only {len(d['dates'])} daily observations")
    last = dt.date.fromisoformat(d["dates"][-1])
    if (today - last).days > 10:
        problems.append(f"latest daily observation {last} is stale")
    for key, col in d["series"].items():
        vals = [v for v in col if v is not None]
        if not vals:
            problems.append(f"{key}: no data")
            continue
        if not all(-3 <= v <= 15 for v in vals):
            problems.append(f"{key}: value outside -3..15%")
        if col[-1] is None and key != "tb1m":
            problems.append(f"{key}: missing latest value")
    m = data["monthly"]
    for key in ("kpif", "kpifxe", "mortgageFloating"):
        vals = [v for v in m["series"].get(key, []) if v is not None]
        if len(vals) < 24:
            problems.append(f"{key}: only {len(vals)} months")
        elif not all(-5 <= v <= 20 for v in vals):
            problems.append(f"{key}: value outside -5..20%")
    return problems


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="validate only, don't write")
    args = ap.parse_args()
    today = dt.date.today()
    print("Riksbank:")
    daily = fetch_riksbank(today.isoformat())
    print("SCB:")
    monthly = fetch_scb()
    data = build(daily, monthly, today.isoformat())
    problems = validate(data, today)
    if problems:
        print("Validation failed, not writing:\n  " + "\n  ".join(problems), file=sys.stderr)
        return 1
    if args.check:
        print("OK (check only)")
        return 0
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(data, separators=(",", ":")) + "\n")
    print(f"Wrote {OUT} ({OUT.stat().st_size // 1024} KB), latest {data['daily']['dates'][-1]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
