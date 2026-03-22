"use client";

import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState, useEffect, useCallback, useRef } from "react";

const COGS_PER_BOX = 94;
const SLIDE_TITLES = ["Scoreboard", "Paid Performance", "Funnel Stages", "Economics", "Creative Health"];
const TOTAL_SLIDES = SLIDE_TITLES.length;

// --- Types ---
interface ShopifyData {
  revenue: number; orders: number; boxes: number; aov: number;
  sub_revenue: number; sub_orders: number; onetime_revenue: number; onetime_orders: number;
  new_customers: number; returning_customers: number; new_revenue: number; returning_revenue: number; new_pct: number;
}
interface MetaData {
  spend: number; impressions: number; clicks: number; purchases: number; pv: number; leads: number; ctr: number; roas: number;
}
interface Creative { name: string; spend: number; roas: number; purchases: number; ctr: number; image_url?: string | null; }
interface PeriodData {
  shopify: ShopifyData; meta: MetaData; blended_roas: number; cac: number; cr: number; top_creatives: Creative[];
}
interface FunnelStage { spend: number; roas: number; impressions: number; purchases: number; pct: number; }
interface CreativeHealth {
  fatigued: Array<{ name: string; ctr_drop_pct: number; roas_drop_pct: number; spend: number }>;
  scaling: Array<{ name: string; spend_increase_pct: number; roas: number; spend: number }>;
  top_spend_share: Array<{ name: string; spend: number; share_pct: number }>;
}
interface ReportData {
  month: string; generated_at: string; error?: string;
  week: PeriodData; prev_week: PeriodData; mtd: PeriodData;
  funnel_stages: Record<string, FunnelStage>;
  creative_health: CreativeHealth;
}

// --- Helpers ---
function fmtKr(n: number): string {
  if (Math.abs(n) >= 10000) return `${(n / 1000).toFixed(1)}k kr`;
  return `${n.toLocaleString("sv-SE")} kr`;
}
function fmtNum(n: number): string { return n.toLocaleString("sv-SE"); }

function delta(curr: number, prev: number): { pct: number; dir: "up" | "down" | "flat" } {
  if (prev === 0) return { pct: 0, dir: "flat" };
  const pct = Math.round(((curr - prev) / prev) * 100);
  return { pct: Math.abs(pct), dir: pct > 0 ? "up" : pct < 0 ? "down" : "flat" };
}

function DeltaBadge({ curr, prev, inverse }: { curr: number; prev: number; inverse?: boolean }) {
  const d = delta(curr, prev);
  if (d.dir === "flat" || d.pct === 0) return <span className="pres-delta pres-delta-flat">—</span>;
  const isGood = inverse ? d.dir === "down" : d.dir === "up";
  return (
    <span className={`pres-delta ${isGood ? "pres-delta-good" : "pres-delta-bad"}`}>
      {d.dir === "up" ? "↑" : "↓"} {d.pct}%
    </span>
  );
}

type InsightStatus = "healthy" | "warning" | "critical";
interface Insight { status: InsightStatus; text: string; }

function InsightBox({ insight }: { insight: Insight }) {
  return (
    <div className={`pres-insight pres-insight-${insight.status}`}>
      <span className="pres-insight-dot" />
      <span>{insight.text}</span>
    </div>
  );
}

function cleanAdName(name: string): string {
  return name.replace(/_/g, " ").replace(/\d{1,2}Ma[rR]$/i, "").trim();
}

// --- Insight Engine ---
function getScoreboardInsight(w: PeriodData, pw: PeriodData): Insight {
  const revDelta = delta(w.shopify.revenue, pw.shopify.revenue);
  if (revDelta.dir === "down" && revDelta.pct > 15)
    return { status: "warning", text: `Revenue down ${revDelta.pct}% vs last week. Check ad performance and site conversion rate.` };
  if (revDelta.dir === "up" && revDelta.pct > 15)
    return { status: "healthy", text: `Revenue up ${revDelta.pct}% vs last week. Momentum is strong.` };
  if (w.shopify.new_pct < 30)
    return { status: "warning", text: `Only ${w.shopify.new_pct}% new customers — acquisition may be slowing. Most revenue from repeat buyers.` };
  if (w.shopify.new_pct > 70)
    return { status: "healthy", text: `${w.shopify.new_pct}% new customers — strong acquisition. Monitor retention for long-term health.` };
  return { status: "healthy", text: "Revenue and order volume are stable week-over-week." };
}

function getPaidInsight(w: PeriodData, pw: PeriodData): Insight {
  if (w.blended_roas < 1.0)
    return { status: "critical", text: `Blended ROAS ${w.blended_roas}x — losing money on paid acquisition. Pause underperformers or raise AOV.` };
  if (w.blended_roas < 2.0)
    return { status: "warning", text: `Blended ROAS ${w.blended_roas}x — marginal profitability. Optimize creatives and targeting.` };
  const cacDelta = delta(w.cac, pw.cac);
  if (cacDelta.dir === "up" && cacDelta.pct > 20)
    return { status: "warning", text: `CAC increased ${cacDelta.pct}% vs last week (${fmtKr(pw.cac)} → ${fmtKr(w.cac)}). Watch for audience fatigue.` };
  return { status: "healthy", text: `Blended ROAS ${w.blended_roas}x — profitable acquisition. Keep scaling what works.` };
}

function getFunnelInsight(stages: Record<string, FunnelStage>): Insight {
  const tof = stages["TOF"];
  const bof = stages["BOF"];
  if (tof && tof.pct > 80)
    return { status: "warning", text: `${tof.pct}% of spend is TOF (benchmark: 60-70%). Consider adding more MOF/BOF to convert warm audiences.` };
  if (tof && tof.pct < 40)
    return { status: "warning", text: `Only ${tof.pct}% on TOF (benchmark: 60-70%). Pipeline may dry up — invest more in awareness.` };
  if (bof && bof.roas > 3)
    return { status: "healthy", text: `BOF ROAS ${bof.roas}x is strong (benchmark: 3-10x). Retargeting is converting well.` };
  if (tof && tof.pct >= 55 && tof.pct <= 75)
    return { status: "healthy", text: `Funnel spend distribution looks healthy. TOF ${tof.pct}% is within the 60-70% benchmark.` };
  return { status: "healthy", text: "Funnel allocation is reasonable. Monitor stage ROAS for optimization opportunities." };
}

function getEconomicsInsight(w: PeriodData, breakEvenCAC: number): Insight {
  const diff = w.cac - breakEvenCAC;
  if (w.cac === 0) return { status: "healthy", text: "Not enough purchase data to calculate CAC." };
  if (diff > 100)
    return { status: "critical", text: `CAC (${fmtKr(w.cac)}) exceeds break-even (${fmtKr(breakEvenCAC)}) by ${fmtKr(diff)}. Urgent: improve creatives or raise AOV.` };
  if (diff > 0)
    return { status: "warning", text: `CAC (${fmtKr(w.cac)}) is ${fmtKr(diff)} above break-even (${fmtKr(breakEvenCAC)}). Optimize to reach profitability.` };
  return { status: "healthy", text: `CAC (${fmtKr(w.cac)}) is ${fmtKr(Math.abs(diff))} below break-even. Unit economics are healthy.` };
}

function getCreativeHealthInsight(health: CreativeHealth): Insight {
  if (health.fatigued.length >= 3)
    return { status: "critical", text: `${health.fatigued.length} creatives showing fatigue (CTR/ROAS declining). Time for new creative iterations.` };
  if (health.fatigued.length > 0)
    return { status: "warning", text: `${health.fatigued.length} creative(s) losing performance. Consider refreshing hooks or testing new angles.` };
  if (health.top_spend_share.length > 0 && health.top_spend_share[0].share_pct > 50)
    return { status: "warning", text: `"${cleanAdName(health.top_spend_share[0].name)}" has ${health.top_spend_share[0].share_pct}% of spend. Diversify to reduce risk.` };
  if (health.scaling.length > 0)
    return { status: "healthy", text: `${health.scaling.length} creative(s) scaling well — spend increasing with stable ROAS.` };
  return { status: "healthy", text: "Creative portfolio is stable. No fatigue signals detected." };
}

// --- BENCHMARKS ---
const FUNNEL_BENCHMARKS: Record<string, { spend_pct: [number, number]; roas: [number, number] }> = {
  TOF: { spend_pct: [60, 70], roas: [0.5, 1.5] },
  MOF: { spend_pct: [15, 25], roas: [1.0, 3.0] },
  BOF: { spend_pct: [10, 20], roas: [3.0, 10.0] },
};

function BenchmarkBar({ value, benchLow, benchHigh, label }: { value: number; benchLow: number; benchHigh: number; label: string }) {
  const max = Math.max(value, benchHigh) * 1.2;
  const valW = (value / max) * 100;
  const lowW = (benchLow / max) * 100;
  const highW = (benchHigh / max) * 100;
  const inRange = value >= benchLow && value <= benchHigh;
  return (
    <div className="pres-bench">
      <div className="pres-bench-label">{label}</div>
      <div className="pres-bench-track">
        <div className="pres-bench-range" style={{ left: `${lowW}%`, width: `${highW - lowW}%` }} />
        <div className={`pres-bench-marker ${inRange ? "pres-bench-ok" : "pres-bench-off"}`} style={{ left: `${valW}%` }} />
      </div>
      <div className="pres-bench-values">
        <span className={inRange ? "pres-val-green" : "pres-val-red"}>{value}%</span>
        <span className="pres-dim">benchmark {benchLow}-{benchHigh}%</span>
      </div>
    </div>
  );
}

// === MAIN COMPONENT ===
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

  const goTo = useCallback((n: number) => setSlide(Math.max(0, Math.min(TOTAL_SLIDES - 1, n))), []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); goTo(slide + 1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); goTo(slide - 1); }
      if (e.key === "Escape" && isFullscreen) document.exitFullscreen?.();
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
    if (document.fullscreenElement) document.exitFullscreen();
    else containerRef.current?.requestFullscreen();
  };

  if (loading) {
    return (
      <div className="pres-loading">
        <div className="pres-loading-spinner" />
        <p>Fetching live data from Shopify & Meta...</p>
      </div>
    );
  }

  if (!data || data.error) {
    return (
      <div className="pres-loading">
        <p>Could not fetch data. Make sure Shopify and Meta are connected.</p>
      </div>
    );
  }

  const w = data.week;
  const pw = data.prev_week;
  const m = data.mtd;
  const fs = data.funnel_stages;
  const ch = data.creative_health;

  const weekMargin = w.shopify.aov - COGS_PER_BOX;
  const mtdMargin = m.shopify.aov - COGS_PER_BOX;
  const weekMarginPct = w.shopify.aov > 0 ? Math.round((weekMargin / w.shopify.aov) * 100) : 0;
  const mtdMarginPct = m.shopify.aov > 0 ? Math.round((mtdMargin / m.shopify.aov) * 100) : 0;
  const weekBECAC = weekMargin;
  const mtdBECAC = mtdMargin;

  return (
    <div className={`pres-container ${isFullscreen ? "pres-fullscreen" : ""}`} ref={containerRef}>
      <div className="pres-topbar">
        <div className="pres-topbar-left">
          <span className="pres-brand">MOBY</span>
          <span className="pres-month">{data.month} — Weekly Report</span>
        </div>
        <div className="pres-topbar-right">
          <span className="pres-slide-counter">{slide + 1} / {TOTAL_SLIDES}</span>
          <button className="pres-fs-btn" onClick={toggleFullscreen}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
              {isFullscreen
                ? <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
                : <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />}
            </svg>
          </button>
        </div>
      </div>

      <div className="pres-slides" style={{ transform: `translateX(-${slide * 100}%)` }}>
        {/* === SLIDE 1: SCOREBOARD === */}
        <div className="pres-slide">
          <h1 className="pres-slide-title">Scoreboard</h1>
          <p className="pres-slide-subtitle">Online revenue & orders (excl. B2B)</p>
          <div className="pres-table-wrap">
            <table className="pres-table">
              <thead>
                <tr><th>Metric</th><th>This Week</th><th>vs Prev</th><th>MTD</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>Revenue</td>
                  <td className="pres-val-accent">{fmtKr(w.shopify.revenue)}</td>
                  <td><DeltaBadge curr={w.shopify.revenue} prev={pw.shopify.revenue} /></td>
                  <td>{fmtKr(m.shopify.revenue)}</td>
                </tr>
                <tr>
                  <td>Orders</td>
                  <td>{fmtNum(w.shopify.orders)}</td>
                  <td><DeltaBadge curr={w.shopify.orders} prev={pw.shopify.orders} /></td>
                  <td>{fmtNum(m.shopify.orders)}</td>
                </tr>
                <tr>
                  <td>AOV</td>
                  <td>{fmtKr(w.shopify.aov)}</td>
                  <td><DeltaBadge curr={w.shopify.aov} prev={pw.shopify.aov} /></td>
                  <td>{fmtKr(m.shopify.aov)}</td>
                </tr>
                <tr>
                  <td>MRR (Subscriptions)</td>
                  <td>{fmtKr(w.shopify.sub_revenue)} <span className="pres-dim">({w.shopify.sub_orders})</span></td>
                  <td><DeltaBadge curr={w.shopify.sub_revenue} prev={pw.shopify.sub_revenue} /></td>
                  <td>{fmtKr(m.shopify.sub_revenue)} <span className="pres-dim">({m.shopify.sub_orders})</span></td>
                </tr>
                <tr>
                  <td>New Customers</td>
                  <td>{w.shopify.new_customers} <span className="pres-dim">({w.shopify.new_pct}%)</span></td>
                  <td><DeltaBadge curr={w.shopify.new_customers} prev={pw.shopify.new_customers} /></td>
                  <td>{m.shopify.new_customers} <span className="pres-dim">({m.shopify.new_pct}%)</span></td>
                </tr>
                <tr>
                  <td>Returning Customers</td>
                  <td>{w.shopify.returning_customers}</td>
                  <td><DeltaBadge curr={w.shopify.returning_customers} prev={pw.shopify.returning_customers} /></td>
                  <td>{m.shopify.returning_customers}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <InsightBox insight={getScoreboardInsight(w, pw)} />
        </div>

        {/* === SLIDE 2: PAID PERFORMANCE === */}
        <div className="pres-slide">
          <h1 className="pres-slide-title">Paid Performance</h1>
          <p className="pres-slide-subtitle">Meta Ads — Blended = Shopify revenue / Meta spend</p>
          <div className="pres-two-col">
            <div className="pres-table-wrap">
              <table className="pres-table">
                <thead>
                  <tr><th>Metric</th><th>This Week</th><th>vs Prev</th><th>MTD</th></tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Spend</td>
                    <td>{fmtKr(w.meta.spend)}</td>
                    <td><DeltaBadge curr={w.meta.spend} prev={pw.meta.spend} inverse /></td>
                    <td>{fmtKr(m.meta.spend)}</td>
                  </tr>
                  <tr>
                    <td>Blended ROAS</td>
                    <td className="pres-val-accent">{w.blended_roas}x</td>
                    <td><DeltaBadge curr={w.blended_roas} prev={pw.blended_roas} /></td>
                    <td className="pres-val-accent">{m.blended_roas}x</td>
                  </tr>
                  <tr>
                    <td>Meta ROAS</td>
                    <td>{w.meta.roas}x</td>
                    <td><DeltaBadge curr={w.meta.roas} prev={pw.meta.roas} /></td>
                    <td>{m.meta.roas}x</td>
                  </tr>
                  <tr>
                    <td>CAC</td>
                    <td className={w.cac > weekBECAC ? "pres-val-red" : "pres-val-green"}>{fmtKr(w.cac)}</td>
                    <td><DeltaBadge curr={w.cac} prev={pw.cac} inverse /></td>
                    <td>{fmtKr(m.cac)}</td>
                  </tr>
                  <tr>
                    <td>Purchases</td>
                    <td>{w.meta.purchases}</td>
                    <td><DeltaBadge curr={w.meta.purchases} prev={pw.meta.purchases} /></td>
                    <td>{m.meta.purchases}</td>
                  </tr>
                  <tr>
                    <td>CTR</td>
                    <td>{w.meta.ctr}%</td>
                    <td><DeltaBadge curr={w.meta.ctr} prev={pw.meta.ctr} /></td>
                    <td>{m.meta.ctr}%</td>
                  </tr>
                  <tr>
                    <td>CR (Click→Purchase)</td>
                    <td>{w.cr}%</td>
                    <td><DeltaBadge curr={w.cr} prev={pw.cr} /></td>
                    <td>{m.cr}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="pres-creatives-col">
              <h3 className="pres-sub-heading">Top Creatives (MTD by ROAS)</h3>
              <div className="pres-creative-list">
                {m.top_creatives.slice(0, 3).map((c, i) => (
                  <div key={i} className="pres-creative-item">
                    {c.image_url ? (
                      <div className="pres-creative-thumb">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={c.image_url} alt={c.name} />
                      </div>
                    ) : (
                      <span className="pres-creative-rank">#{i + 1}</span>
                    )}
                    <div className="pres-creative-info">
                      <span className="pres-creative-name">{cleanAdName(c.name)}</span>
                      <span className="pres-creative-stats">
                        <span className="pres-val-accent">{c.roas}x</span> ROAS &middot; {c.purchases} purch &middot; {fmtKr(c.spend)}
                      </span>
                    </div>
                  </div>
                ))}
                {w.top_creatives.length === 0 && <p className="pres-dim">No ad data for this week</p>}
              </div>
            </div>
          </div>
          <InsightBox insight={getPaidInsight(w, pw)} />
        </div>

        {/* === SLIDE 3: FUNNEL STAGES === */}
        <div className="pres-slide">
          <h1 className="pres-slide-title">Funnel Stage Breakdown</h1>
          <p className="pres-slide-subtitle">Spend allocation & ROAS by funnel stage (from synced creatives)</p>
          {Object.keys(fs).length > 0 ? (
            <div className="pres-funnel-grid">
              <div className="pres-table-wrap">
                <table className="pres-table">
                  <thead>
                    <tr><th>Stage</th><th>Spend</th><th>Share</th><th>ROAS</th><th>Purchases</th></tr>
                  </thead>
                  <tbody>
                    {["TOF", "MOF", "BOF"].map((stage) => {
                      const s = fs[stage];
                      if (!s) return null;
                      return (
                        <tr key={stage}>
                          <td><span className={`pres-stage-badge pres-stage-${stage.toLowerCase()}`}>{stage}</span></td>
                          <td>{fmtKr(s.spend)}</td>
                          <td>{s.pct}%</td>
                          <td className={s.roas >= 1 ? "pres-val-green" : "pres-val-red"}>{s.roas}x</td>
                          <td>{s.purchases}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="pres-bench-col">
                <h3 className="pres-sub-heading">vs Industry Benchmarks</h3>
                {["TOF", "MOF", "BOF"].map((stage) => {
                  const s = fs[stage];
                  const b = FUNNEL_BENCHMARKS[stage];
                  if (!s || !b) return null;
                  return <BenchmarkBar key={stage} value={s.pct} benchLow={b.spend_pct[0]} benchHigh={b.spend_pct[1]} label={`${stage} Spend`} />;
                })}
              </div>
            </div>
          ) : (
            <div className="pres-empty-msg">
              <p>No funnel stage data available. Run AI analysis on your creatives to classify them into TOF/MOF/BOF.</p>
            </div>
          )}
          <InsightBox insight={getFunnelInsight(fs)} />
        </div>

        {/* === SLIDE 4: ECONOMICS === */}
        <div className="pres-slide">
          <h1 className="pres-slide-title">Economics</h1>
          <p className="pres-slide-subtitle">Unit economics &middot; COGS {fmtKr(COGS_PER_BOX)}/box</p>
          <div className="pres-table-wrap">
            <table className="pres-table">
              <thead>
                <tr><th>Metric</th><th>This Week</th><th>vs Prev</th><th>MTD</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>AOV</td>
                  <td>{fmtKr(w.shopify.aov)}</td>
                  <td><DeltaBadge curr={w.shopify.aov} prev={pw.shopify.aov} /></td>
                  <td>{fmtKr(m.shopify.aov)}</td>
                </tr>
                <tr>
                  <td>Gross Margin</td>
                  <td>{fmtKr(weekMargin)} <span className="pres-dim">({weekMarginPct}%)</span></td>
                  <td><DeltaBadge curr={weekMargin} prev={pw.shopify.aov - COGS_PER_BOX} /></td>
                  <td>{fmtKr(mtdMargin)} <span className="pres-dim">({mtdMarginPct}%)</span></td>
                </tr>
                <tr>
                  <td>Break-even CAC</td>
                  <td className="pres-val-accent">{fmtKr(weekBECAC)}</td>
                  <td />
                  <td className="pres-val-accent">{fmtKr(mtdBECAC)}</td>
                </tr>
                <tr>
                  <td>Actual CAC</td>
                  <td className={w.cac > weekBECAC ? "pres-val-red" : "pres-val-green"}>{fmtKr(w.cac)}</td>
                  <td><DeltaBadge curr={w.cac} prev={pw.cac} inverse /></td>
                  <td className={m.cac > mtdBECAC ? "pres-val-red" : "pres-val-green"}>{fmtKr(m.cac)}</td>
                </tr>
                <tr>
                  <td>CAC vs Break-even</td>
                  <td className={w.cac > weekBECAC ? "pres-val-red" : "pres-val-green"}>
                    {w.cac > 0 ? `${w.cac > weekBECAC ? "+" : ""}${fmtKr(w.cac - weekBECAC)}` : "—"}
                  </td>
                  <td />
                  <td className={m.cac > mtdBECAC ? "pres-val-red" : "pres-val-green"}>
                    {m.cac > 0 ? `${m.cac > mtdBECAC ? "+" : ""}${fmtKr(m.cac - mtdBECAC)}` : "—"}
                  </td>
                </tr>
                <tr>
                  <td>Blended ROAS</td>
                  <td className="pres-val-accent">{w.blended_roas}x</td>
                  <td><DeltaBadge curr={w.blended_roas} prev={pw.blended_roas} /></td>
                  <td className="pres-val-accent">{m.blended_roas}x</td>
                </tr>
              </tbody>
            </table>
          </div>
          <InsightBox insight={getEconomicsInsight(w, weekBECAC)} />
        </div>

        {/* === SLIDE 5: CREATIVE HEALTH === */}
        <div className="pres-slide">
          <h1 className="pres-slide-title">Creative Health</h1>
          <p className="pres-slide-subtitle">Performance changes vs last week</p>
          <div className="pres-health-grid">
            {/* Fatigue alerts */}
            <div className="pres-health-section">
              <h3 className="pres-sub-heading">
                {ch.fatigued.length > 0 ? "⚠ Fatigue Signals" : "No Fatigue Detected"}
              </h3>
              {ch.fatigued.length > 0 ? (
                <div className="pres-health-cards">
                  {ch.fatigued.map((c, i) => (
                    <div key={i} className="pres-health-card pres-health-card-warn">
                      <span className="pres-health-card-name">{cleanAdName(c.name)}</span>
                      <div className="pres-health-card-stats">
                        {c.ctr_drop_pct > 0 && <span>CTR <span className="pres-val-red">↓{c.ctr_drop_pct}%</span></span>}
                        {c.roas_drop_pct > 0 && <span>ROAS <span className="pres-val-red">↓{c.roas_drop_pct}%</span></span>}
                        <span className="pres-dim">{fmtKr(c.spend)} spent</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="pres-dim">All creatives maintaining performance.</p>
              )}
            </div>

            {/* Scaling winners */}
            <div className="pres-health-section">
              <h3 className="pres-sub-heading">
                {ch.scaling.length > 0 ? "Scaling Winners" : "No Scaling Creatives"}
              </h3>
              {ch.scaling.length > 0 ? (
                <div className="pres-health-cards">
                  {ch.scaling.map((c, i) => (
                    <div key={i} className="pres-health-card pres-health-card-ok">
                      <span className="pres-health-card-name">{cleanAdName(c.name)}</span>
                      <div className="pres-health-card-stats">
                        <span>Spend <span className="pres-val-green">↑{c.spend_increase_pct}%</span></span>
                        <span>ROAS <span className="pres-val-accent">{c.roas}x</span></span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="pres-dim">No creatives scaling significantly this week.</p>
              )}
            </div>

            {/* Spend concentration */}
            <div className="pres-health-section">
              <h3 className="pres-sub-heading">Spend Concentration</h3>
              {ch.top_spend_share.length > 0 ? (
                <div className="pres-spend-bars">
                  {ch.top_spend_share.map((c, i) => (
                    <div key={i} className="pres-spend-bar-row">
                      <span className="pres-spend-bar-name">{cleanAdName(c.name)}</span>
                      <div className="pres-spend-bar-track">
                        <div
                          className={`pres-spend-bar-fill ${c.share_pct > 50 ? "pres-spend-bar-warn" : ""}`}
                          style={{ width: `${c.share_pct}%` }}
                        />
                      </div>
                      <span className="pres-spend-bar-pct">{c.share_pct}%</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="pres-dim">No spend data available.</p>
              )}
            </div>
          </div>
          <InsightBox insight={getCreativeHealthInsight(ch)} />
        </div>
      </div>

      {/* Navigation */}
      <div className="pres-nav">
        <button className="pres-nav-btn" onClick={() => goTo(slide - 1)} disabled={slide === 0}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <div className="pres-dots">
          {SLIDE_TITLES.map((t, i) => (
            <button key={i} className={`pres-dot ${i === slide ? "pres-dot-active" : ""}`} onClick={() => goTo(i)} title={t}>
              <span className="pres-dot-label">{t}</span>
            </button>
          ))}
        </div>
        <button className="pres-nav-btn" onClick={() => goTo(slide + 1)} disabled={slide === TOTAL_SLIDES - 1}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20"><path d="M9 18l6-6-6-6" /></svg>
        </button>
      </div>
    </div>
  );
}
