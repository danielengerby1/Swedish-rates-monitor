import datetime as dt
import io
import json
import sys
import urllib.error
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import fetch_data as fd  # noqa: E402


def test_jsonstat_records_row_major():
    js = {
        "id": ["A", "Tid"], "size": [2, 3],
        "dimension": {
            "A": {"category": {"index": {"x": 0, "y": 1}}},
            "Tid": {"category": {"index": ["2026M01", "2026M02", "2026M03"]}},
        },
        "value": [1, 2, 3, 4, None, 6],
    }
    recs = fd.jsonstat_records(js)
    assert recs[0] == ({"A": "x", "Tid": "2026M01"}, 1.0)
    assert recs[3] == ({"A": "y", "Tid": "2026M01"}, 4.0)
    assert recs[4][1] is None


def test_month_to_iso():
    assert fd.month_to_iso("2026M09") == "2026-09"


def test_build_forward_fills_short_gaps_only():
    daily = {"a": {"2026-01-01": 1.0, "2026-01-09": 2.0}, "b": {f"2026-01-0{i}": float(i) for i in range(1, 10)}}
    out = fd.build(daily, {"k": {"2026-01": 1.0}}, "2026-01-10")
    a = out["daily"]["series"]["a"]
    assert a[:6] == [1.0] * 6          # filled for 5 days
    assert a[6:8] == [None, None]      # then a break
    assert a[8] == 2.0
    assert out["monthly"]["series"]["k"] == [1.0]


def good_data(today="2026-11-11"):
    dates = [(dt.date(2017, 1, 2) + dt.timedelta(days=i)).isoformat() for i in range(3600)]
    dates = [d for d in dates if d <= today]
    series = {k: [2.0] * len(dates) for k in fd.RIKSBANK}
    months = [f"{y}-{m:02d}" for y in range(2020, 2027) for m in range(1, 13)]
    mser = {k: [1.0] * len(months) for k in ("kpif", "kpifxe", "mortgageFloating")}
    return {"daily": {"dates": dates, "series": series}, "monthly": {"months": months, "series": mser}}


def test_validate_accepts_good_data():
    assert fd.validate(good_data(), dt.date(2026, 11, 11)) == []


def test_validate_rejects_stale_and_out_of_range():
    d = good_data(today="2026-10-01")
    d["daily"]["series"]["gb10y"][-1] = 40.0
    probs = fd.validate(d, dt.date(2026, 11, 11))
    assert any("stale" in p for p in probs)
    assert any("gb10y" in p and "outside" in p for p in probs)


def test_get_json_waits_out_rate_limit(monkeypatch):
    calls, slept = [], []

    class Resp(io.BytesIO):
        def __enter__(self): return self
        def __exit__(self, *a): pass

    def fake_urlopen(req, timeout):
        calls.append(req.full_url)
        if len(calls) == 1:
            raise urllib.error.HTTPError(req.full_url, 429, "Too Many", {"Retry-After": "7"}, None)
        return Resp(json.dumps([{"date": "2026-01-01", "value": 1.5}]).encode())

    monkeypatch.setattr(fd.urllib.request, "urlopen", fake_urlopen)
    out = fd.get_json("https://example.test/x", sleep=slept.append)
    assert out[0]["value"] == 1.5 and slept == [8] and len(calls) == 2


def test_get_json_does_not_retry_client_errors(monkeypatch):
    def fake_urlopen(req, timeout):
        raise urllib.error.HTTPError(req.full_url, 404, "Not found", {}, None)
    monkeypatch.setattr(fd.urllib.request, "urlopen", fake_urlopen)
    with pytest.raises(urllib.error.HTTPError):
        fd.get_json("https://example.test/missing", sleep=lambda s: None)
