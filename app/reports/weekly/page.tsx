"use client";

import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState, useEffect, useCallback, useRef } from "react";

const COGS_PER_BOX = 94;
const SLIDE_TITLES = ["Scoreboard", "Paid Performance", "Funnel", "Economics"];

interface ShopifyData {
  revenue: number;
  orders: number;
  boxes: number;
  aov: number;
  sub_revenue: number;
  sub_orders: number;
  onetime_revenue: number;
  onetime_orders: number;
}

interface MetaData {
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number;
  pv: number;
  leads: number;
  ctr: number;
  roas: number;
}

interface Creative {
  name: string;
  spend: number;
  roas: number;
  purchases: number;
  ctr: number;
}

interface PeriodData {
  shopify: ShopifyData;
  meta: MetaData;
  blended_roas: number;
  cac: number;
  top_creatives: Creative[];
}

interface ReportData {
  month: string;
  generated_at: string;
  week: PeriodData;
  mtd: PeriodData;
  error?: string;
}

function fmtKr(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k kr`;
  return `${n.toLocaleString("sv-SE")} kr`;
}

function fmtNum(n: number): string {
  return n.toLocaleString("sv-SE");
}

export default function WeeklyReportPage() {
  const gather = useAction(api.weeklyReport.gather);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [slide, setSlide] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gather()
      .then((d) => setData(d as unknown as ReportData))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [gather]);

  const goTo = useCallback(
    (n: number) => setSlide(Math.max(0, Math.min(3, n))),
    []
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); goTo(slide + 1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); goTo(slide - 1); }
      if (e.key === "Escape" && isFullscreen) {
        document.exitFullscreen?.();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [slide, goTo, isFullscreen]);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerRef.current?.requestFullscreen();
    }
  };

  if (loading) {
    return (
      <div className="pres-loading">
        <div className="pres-loading-spinner" />
        <p>Hämtar data från Shopify & Meta...</p>
      </div>
    );
  }

  if (!data || data.error) {
    return (
      <div className="pres-loading">
        <p>Kunde inte hämta data. Kontrollera att Shopify och Meta är kopplade.</p>
      </div>
    );
  }

  const w = data.week;
  const m = data.mtd;

  // Economics calculations
  const weekMarginPct = w.shopify.aov > 0 ? Math.round(((w.shopify.aov - COGS_PER_BOX) / w.shopify.aov) * 100) : 0;
  const mtdMarginPct = m.shopify.aov > 0 ? Math.round(((m.shopify.aov - COGS_PER_BOX) / m.shopify.aov) * 100) : 0;
  const weekBreakEvenCAC = w.shopify.aov - COGS_PER_BOX;
  const mtdBreakEvenCAC = m.shopify.aov - COGS_PER_BOX;
  const weekCACDiff = w.cac > 0 ? w.cac - weekBreakEvenCAC : 0;
  const mtdCACDiff = m.cac > 0 ? m.cac - mtdBreakEvenCAC : 0;

  return (
    <div className={`pres-container ${isFullscreen ? "pres-fullscreen" : ""}`} ref={containerRef}>
      {/* Top bar */}
      <div className="pres-topbar">
        <div className="pres-topbar-left">
          <span className="pres-brand">MOBY</span>
          <span className="pres-month">{data.month} Weekly Report</span>
        </div>
        <div className="pres-topbar-right">
          <span className="pres-slide-counter">{slide + 1} / {SLIDE_TITLES.length}</span>
          <button className="pres-fs-btn" onClick={toggleFullscreen} title="Toggle fullscreen">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
              {isFullscreen ? (
                <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
              ) : (
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Slides */}
      <div className="pres-slides" style={{ transform: `translateX(-${slide * 100}%)` }}>
        {/* SLIDE 1: Scoreboard */}
        <div className="pres-slide">
          <h1 className="pres-slide-title">Scoreboard</h1>
          <p className="pres-slide-subtitle">Online revenue & orders (excl. B2B)</p>
          <div className="pres-table-wrap">
            <table className="pres-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>This Week</th>
                  <th>MTD</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Revenue</td>
                  <td className="pres-val-accent">{fmtKr(w.shopify.revenue)}</td>
                  <td className="pres-val-accent">{fmtKr(m.shopify.revenue)}</td>
                </tr>
                <tr>
                  <td>Orders</td>
                  <td>{fmtNum(w.shopify.orders)}</td>
                  <td>{fmtNum(m.shopify.orders)}</td>
                </tr>
                <tr>
                  <td>Boxes Sold</td>
                  <td>{fmtNum(w.shopify.boxes)}</td>
                  <td>{fmtNum(m.shopify.boxes)}</td>
                </tr>
                <tr>
                  <td>AOV</td>
                  <td>{fmtKr(w.shopify.aov)}</td>
                  <td>{fmtKr(m.shopify.aov)}</td>
                </tr>
                <tr>
                  <td>MRR (Subscriptions)</td>
                  <td>{fmtKr(w.shopify.sub_revenue)} <span className="pres-dim">({w.shopify.sub_orders} orders)</span></td>
                  <td>{fmtKr(m.shopify.sub_revenue)} <span className="pres-dim">({m.shopify.sub_orders} orders)</span></td>
                </tr>
                <tr>
                  <td>One-time Revenue</td>
                  <td>{fmtKr(w.shopify.onetime_revenue)}</td>
                  <td>{fmtKr(m.shopify.onetime_revenue)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* SLIDE 2: Paid Performance */}
        <div className="pres-slide">
          <h1 className="pres-slide-title">Paid Performance</h1>
          <p className="pres-slide-subtitle">Meta Ads (all campaigns)</p>
          <div className="pres-two-col">
            <div className="pres-table-wrap">
              <table className="pres-table">
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th>This Week</th>
                    <th>MTD</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Spend</td>
                    <td>{fmtKr(w.meta.spend)}</td>
                    <td>{fmtKr(m.meta.spend)}</td>
                  </tr>
                  <tr>
                    <td>CAC</td>
                    <td className={w.cac > weekBreakEvenCAC ? "pres-val-red" : "pres-val-green"}>{fmtKr(w.cac)}</td>
                    <td className={m.cac > mtdBreakEvenCAC ? "pres-val-red" : "pres-val-green"}>{fmtKr(m.cac)}</td>
                  </tr>
                  <tr>
                    <td>Blended ROAS</td>
                    <td className="pres-val-accent">{w.blended_roas}x</td>
                    <td className="pres-val-accent">{m.blended_roas}x</td>
                  </tr>
                  <tr>
                    <td>Meta ROAS</td>
                    <td>{w.meta.roas}x</td>
                    <td>{m.meta.roas}x</td>
                  </tr>
                  <tr>
                    <td>Purchases</td>
                    <td>{w.meta.purchases}</td>
                    <td>{m.meta.purchases}</td>
                  </tr>
                  <tr>
                    <td>CTR</td>
                    <td>{w.meta.ctr}%</td>
                    <td>{m.meta.ctr}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="pres-creatives-col">
              <h3 className="pres-sub-heading">Top Creatives (MTD by ROAS)</h3>
              <div className="pres-creative-list">
                {m.top_creatives.slice(0, 3).map((c, i) => (
                  <div key={i} className="pres-creative-item">
                    <span className="pres-creative-rank">#{i + 1}</span>
                    <div className="pres-creative-info">
                      <span className="pres-creative-name">{c.name.replace(/_/g, " ").replace(/\d{2}Mar$/i, "")}</span>
                      <span className="pres-creative-stats">
                        <span className="pres-val-accent">{c.roas}x</span> ROAS &middot; {c.purchases} purchases &middot; {fmtKr(c.spend)} spend
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* SLIDE 3: Funnel */}
        <div className="pres-slide">
          <h1 className="pres-slide-title">Funnel</h1>
          <p className="pres-slide-subtitle">Sessions &rarr; ATC &rarr; Checkout &rarr; Purchase</p>
          <div className="pres-funnel-placeholder">
            <div className="pres-funnel-visual">
              <div className="pres-funnel-step" style={{ width: "100%" }}>
                <span className="pres-funnel-label">Sessions</span>
                <span className="pres-funnel-value">-</span>
              </div>
              <div className="pres-funnel-step" style={{ width: "70%" }}>
                <span className="pres-funnel-label">Add to Cart</span>
                <span className="pres-funnel-value">-</span>
              </div>
              <div className="pres-funnel-step" style={{ width: "45%" }}>
                <span className="pres-funnel-label">Checkout</span>
                <span className="pres-funnel-value">-</span>
              </div>
              <div className="pres-funnel-step" style={{ width: "25%" }}>
                <span className="pres-funnel-label">Purchase</span>
                <span className="pres-funnel-value">{fmtNum(m.shopify.orders)}</span>
              </div>
            </div>
            <p className="pres-funnel-note">
              Fill in Sessions, ATC & Checkout from Shopify Analytics or Google Analytics.
              <br />
              Purchase count from Shopify: <strong>{m.shopify.orders} orders</strong> (MTD).
            </p>
          </div>
        </div>

        {/* SLIDE 4: Economics */}
        <div className="pres-slide">
          <h1 className="pres-slide-title">Economics</h1>
          <p className="pres-slide-subtitle">Unit economics &middot; COGS {fmtKr(COGS_PER_BOX)}/box</p>
          <div className="pres-table-wrap">
            <table className="pres-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>This Week</th>
                  <th>MTD</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>AOV</td>
                  <td>{fmtKr(w.shopify.aov)}</td>
                  <td>{fmtKr(m.shopify.aov)}</td>
                </tr>
                <tr>
                  <td>Gross Margin</td>
                  <td>{fmtKr(w.shopify.aov - COGS_PER_BOX)} <span className="pres-dim">({weekMarginPct}%)</span></td>
                  <td>{fmtKr(m.shopify.aov - COGS_PER_BOX)} <span className="pres-dim">({mtdMarginPct}%)</span></td>
                </tr>
                <tr>
                  <td>Break-even CAC</td>
                  <td className="pres-val-accent">{fmtKr(weekBreakEvenCAC)}</td>
                  <td className="pres-val-accent">{fmtKr(mtdBreakEvenCAC)}</td>
                </tr>
                <tr>
                  <td>Actual CAC</td>
                  <td className={w.cac > weekBreakEvenCAC ? "pres-val-red" : "pres-val-green"}>{fmtKr(w.cac)}</td>
                  <td className={m.cac > mtdBreakEvenCAC ? "pres-val-red" : "pres-val-green"}>{fmtKr(m.cac)}</td>
                </tr>
                <tr>
                  <td>CAC vs Break-even</td>
                  <td className={weekCACDiff > 0 ? "pres-val-red" : "pres-val-green"}>
                    {weekCACDiff > 0 ? "+" : ""}{fmtKr(weekCACDiff)} {weekCACDiff > 0 ? "over" : "under"}
                  </td>
                  <td className={mtdCACDiff > 0 ? "pres-val-red" : "pres-val-green"}>
                    {mtdCACDiff > 0 ? "+" : ""}{fmtKr(mtdCACDiff)} {mtdCACDiff > 0 ? "over" : "under"}
                  </td>
                </tr>
                <tr>
                  <td>Blended ROAS</td>
                  <td className="pres-val-accent">{w.blended_roas}x</td>
                  <td className="pres-val-accent">{m.blended_roas}x</td>
                </tr>
              </tbody>
            </table>
          </div>

          {(weekCACDiff > 0 || mtdCACDiff > 0) && (
            <div className="pres-callout pres-callout-warn">
              CAC exceeds break-even — focus on improving creatives or increasing AOV.
            </div>
          )}
          {weekCACDiff <= 0 && mtdCACDiff <= 0 && (
            <div className="pres-callout pres-callout-ok">
              CAC is below break-even — unit economics are healthy.
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="pres-nav">
        <button className="pres-nav-btn" onClick={() => goTo(slide - 1)} disabled={slide === 0}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <div className="pres-dots">
          {SLIDE_TITLES.map((t, i) => (
            <button
              key={i}
              className={`pres-dot ${i === slide ? "pres-dot-active" : ""}`}
              onClick={() => goTo(i)}
              title={t}
            >
              <span className="pres-dot-label">{t}</span>
            </button>
          ))}
        </div>
        <button className="pres-nav-btn" onClick={() => goTo(slide + 1)} disabled={slide === 3}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20"><path d="M9 18l6-6-6-6" /></svg>
        </button>
      </div>
    </div>
  );
}
