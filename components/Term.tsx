"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Plain-English explanations shown when hovering (or tapping) a metric name. */
export const GLOSSARY = {
  policy: {
    title: "Policy rate",
    body: "The interest rate the Riksbank sets to steer the economy. Banks' short-term borrowing costs follow it closely, so it feeds into floating mortgage rates and savings rates within weeks.",
  },
  yieldCurve: {
    title: "Yield curve",
    body: "The yields on government debt across maturities, from 1-month bills to 10-year bonds. Its slope shows what markets expect for future rates, growth and inflation.",
  },
  slope: {
    title: "Curve slope (10y − 3m)",
    body: "The 10-year bond yield minus the 3-month bill yield. Positive is normal. Negative (an inverted curve) means markets expect short rates to fall, and has often preceded slowdowns.",
  },
  inversion: {
    title: "Inversion",
    body: "When short-term rates are above long-term rates. It usually happens when a central bank has raised rates to fight inflation and markets expect cuts later.",
  },
  kpif: {
    title: "CPIF (KPIF)",
    body: "Consumer prices with mortgage rates held fixed. It is the Riksbank's target measure, so a rate hike can't push measured inflation up mechanically through housing costs. The target is 2%.",
  },
  kpifxe: {
    title: "CPIF excl. energy (KPIF-XE)",
    body: "CPIF without electricity and fuel prices, which swing a lot. It is a common gauge of underlying inflation pressure.",
  },
  realRate: {
    title: "Real policy rate",
    body: "The policy rate minus inflation (CPIF). Positive means money is tight in real terms and policy is restraining demand; negative means it is still stimulating.",
  },
  mortgageRate: {
    title: "New mortgage rate",
    body: "The average rate Swedish banks charged on new and renegotiated mortgages that month (SCB), weighted across houses and apartments. Floating = rate fixed for up to 3 months.",
  },
  mortgageSpread: {
    title: "Mortgage spread",
    body: "The gap between banks' floating mortgage rate and the policy rate. It covers the banks' funding costs, capital requirements and margin.",
  },
  bp: {
    title: "Basis point (bp)",
    body: "One hundredth of a percentage point: 0.01%. A move from 2.50% to 2.75% is 25 bp.",
  },
  duration: {
    title: "Modified duration",
    body: "How sensitive a bond's price is to its yield. A duration of 8 means the price falls about 8% if yields rise one percentage point.",
  },
  convexity: {
    title: "Convexity",
    body: "How duration itself changes as yields move. Positive convexity means losses from rising yields are a bit smaller, and gains from falling yields a bit bigger, than duration alone predicts.",
  },
  dv01: {
    title: "DV01",
    body: "The price change for a one-basis-point fall in yield, here per 100 SEK of nominal. Traders use it to compare the rate risk of different bonds.",
  },
  ytm: {
    title: "Yield to maturity",
    body: "The single annual return you lock in if you buy the bond at today's price and hold it to maturity, with coupons reinvested at the same rate.",
  },
  deduction: {
    title: "Interest deduction (ränteavdrag)",
    body: "Swedish tax relief on mortgage interest: 30% of interest up to 100,000 SEK a year per borrower, and 21% above that.",
  },
} as const;

export type TermKey = keyof typeof GLOSSARY;

/**
 * A metric label with a dotted underline that shows an explanation on hover, keyboard
 * focus or tap. The box is rendered in a portal with fixed positioning so scrollable
 * tables don't clip it, and it is kept inside the viewport.
 */
export function Term({ k, children }: { k: TermKey; children: React.ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean } | null>(null);
  const id = useId();
  const shownAt = useRef(0);
  const g = GLOSSARY[k];

  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const W = 280, margin = 8;
    const left = Math.min(Math.max(margin, r.left + r.width / 2 - W / 2), window.innerWidth - W - margin);
    const above = r.bottom + 170 > window.innerHeight && r.top > 180;
    shownAt.current = Date.now();
    setPos({ left, top: above ? r.top - 8 : r.bottom + 8, above });
  };
  const hide = () => setPos(null);

  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => { window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close); };
  }, [pos]);

  return (
    <>
      <span ref={ref} className="term" tabIndex={0} aria-describedby={pos ? id : undefined}
        onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}
        onClick={(e) => {
          // Touch screens have no hover: a tap toggles the explanation instead of e.g. re-sorting a table.
          if (window.matchMedia("(hover: hover)").matches) return;
          e.stopPropagation();
          // A tap fires focus (which opens it) right before click; don't let the click close it again.
          if (pos && Date.now() - shownAt.current > 400) hide(); else show();
        }}>
        {children}
      </span>
      {pos && typeof document !== "undefined" && createPortal(
        <div id={id} role="tooltip" className="term-box"
          style={{ left: pos.left, top: pos.top, transform: pos.above ? "translateY(-100%)" : undefined }}>
          <b>{g.title}</b>
          <span>{g.body}</span>
        </div>,
        document.body,
      )}
    </>
  );
}
