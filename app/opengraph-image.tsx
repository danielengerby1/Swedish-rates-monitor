import { ImageResponse } from "next/og";
import { loadData } from "@/lib/load";
import { snapshot } from "@/lib/insights";
import { CURVE, valueAt } from "@/lib/data";

export const alt = "Swedish Rates & Inflation Monitor: policy rate, yield curve, inflation and mortgage rates";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const C = { bg: "#fcfcfb", ink: "#0b0b0b", ink2: "#52514e", muted: "#898781", grid: "#e1e0d9", blue: "#2a78d6" };

/** Built from the committed data snapshot at deploy time. Content is centred so LinkedIn's crop keeps it. */
export default function Image() {
  const data = loadData();
  const s = data ? snapshot(data) : null;
  const stats = s ? [
    { k: "Policy rate", v: `${s.policy.toFixed(2)}%` },
    { k: "10-year yield", v: `${s.y10.toFixed(2)}%` },
    { k: "Inflation (CPIF)", v: `${s.kpif.toFixed(1)}%` },
    { k: "Floating mortgage", v: `${s.mortgage.toFixed(2)}%` },
  ] : [];

  // Mini yield curve, sqrt-scaled maturities like the dashboard.
  const W = 460, H = 120;
  let path = "", dots: { x: number; y: number }[] = [];
  if (data && s) {
    const pts = CURVE.map((p) => ({ x: Math.sqrt(p.years / 10) * W, v: valueAt(data, p.key, s.date) })).filter((p) => p.v != null) as { x: number; v: number }[];
    const lo = Math.min(...pts.map((p) => p.v)) - 0.1, hi = Math.max(...pts.map((p) => p.v)) + 0.1;
    dots = pts.map((p) => ({ x: p.x, y: H - ((p.v - lo) / (hi - lo)) * H }));
    path = dots.map((d, i) => `${i ? "L" : "M"}${d.x.toFixed(1)},${d.y.toFixed(1)}`).join(" ");
  }

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", background: C.bg, padding: "44px 60px", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", fontSize: 20, letterSpacing: 3, color: C.muted, textTransform: "uppercase" }}>
          Sweden · official data · updated daily
        </div>
        <div style={{ display: "flex", fontSize: 58, color: C.ink, marginTop: 8, textAlign: "center" }}>Swedish Rates &amp;</div>
        <div style={{ display: "flex", fontSize: 58, color: C.ink, marginTop: -6 }}>Inflation Monitor</div>
        {s && (
          <div style={{ display: "flex", flexWrap: "wrap", width: 560, justifyContent: "center", marginTop: 22 }}>
            {stats.map((x, i) => (
              <div key={x.k} style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 280, marginBottom: 14 }}>
                <div style={{ display: "flex", fontSize: 20, color: C.ink2 }}>{x.k}</div>
                <div style={{ display: "flex", fontSize: 44, color: i === 0 ? C.blue : C.ink }}>{x.v}</div>
              </div>
            ))}
          </div>
        )}
        {path && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
              <line x1={0} x2={W} y1={H} y2={H} stroke={C.grid} strokeWidth={2} />
              <path d={path} stroke={C.blue} strokeWidth={4} fill="none" />
              {dots.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={5} fill={C.blue} />)}
            </svg>
            <div style={{ display: "flex", fontSize: 17, color: C.muted, marginTop: 6 }}>Yield curve, 1 month to 10 years · {s?.date}</div>
          </div>
        )}
      </div>
    ),
    size,
  );
}
