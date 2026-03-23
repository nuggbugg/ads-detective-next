"use client";

import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState, useEffect, useCallback, useRef } from "react";

const COGS_PER_BOX = 94;
const SLIDE_TITLES = ["Scoreboard", "Paid Performance", "Economics"];
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
  shopify: ShopifyData; meta: MetaData; blended_roas: number; cac: number; blended_cac: number; cr: number; top_creatives: Creative[];
}
interface FunnelStage { spend: number; roas: number; impressions: number; purchases: number; pct: number; }
interface CreativeHealth {
  fatigued: Array<{ name: string; ctr_drop_pct: number; roas_drop_pct: number; spend: number }>;
  scaling: Array<{ name: string; spend_increase_pct: number; roas: number; spend: number }>;
  top_spend_share: Array<{ name: string; spend: number; share_pct: number }>;
}
interface AnalyticsData { sessions: number; atc: number; checkouts: number; cr: number; }
interface ReportData {
  month: string; week_label?: string; generated_at: string; error?: string;
  week: PeriodData; prev_week: PeriodData; mtd: PeriodData;
  analytics: { week: AnalyticsData; prev_week: AnalyticsData; mtd: AnalyticsData };
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

// Tooltip descriptions for all metrics
const TIPS: Record<string, string> = {
  "Revenue": "Total online revenue from Shopify (excl. B2B). Includes one-time and subscription orders.",
  "Orders": "Number of online orders placed on Shopify this period (excl. B2B).",
  "AOV": "Average Order Value = Revenue / Orders. Higher AOV means more revenue per customer.",
  "MRR (Subscriptions)": "Monthly Recurring Revenue from subscription orders. Predictable income stream.",
  "New Customers": "Customers placing their first order. High % = strong acquisition.",
  "Returning Customers": "Customers who have ordered before. Sign of product-market fit and retention.",
  "CR (Session→Purchase)": "Conversion Rate = Purchases / Sessions. Measures how well your site converts visitors.",
  "Spend": "Total ad spend on Meta (Facebook/Instagram) for this period.",
  "Blended ROAS": "Blended Return on Ad Spend = Total Shopify Revenue / Total Meta Spend. The most accurate ROAS since it captures all purchases, not just Meta-tracked ones.",
  "Meta ROAS": "Meta-reported ROAS. Only counts purchases Meta can track (often understated due to iOS privacy).",
  "Blended CAC": "Blended Customer Acquisition Cost = Total Meta Spend / Total Shopify Orders. More accurate than Meta CAC.",
  "Meta CAC": "Meta-only CAC = Spend / Meta-attributed Purchases. Often overstated since Meta misses some conversions.",
  "Purchases": "Number of purchases Meta tracked via pixel. Usually lower than actual Shopify orders.",
  "CTR": "Click-Through Rate = Clicks / Impressions. Measures how compelling your ads are. Good DTC benchmark: 1.5-3%.",
  "CR (Click→Purchase)": "Conversion Rate from ad click to purchase. Measures landing page + checkout effectiveness.",
  "Gross Margin": "Revenue minus COGS per unit. What you keep after product cost. Higher = more room for ad spend.",
  "Break-even CAC": "Maximum CAC before losing money = AOV - COGS. Your CAC ceiling.",
  "Blended CAC ": "Total Meta Spend / Total Shopify Orders. Should be below Break-even CAC for profitability.",
  "CAC vs Break-even": "Difference between actual CAC and break-even. Negative (green) = profitable. Positive (red) = losing money per customer.",
  "Meta CAC (for reference)": "Meta-only CAC shown for reference. Usually higher than blended since Meta under-reports conversions.",
};

function Tip({ label, customTip }: { label: string; customTip?: string }) {
  const tip = customTip || TIPS[label] || "";
  if (!tip) return <td>{label}</td>;
  return (
    <td className="pres-tip-cell">
      {label}
      <span className="pres-tip-icon">?</span>
      <span className="pres-tip-bubble">{tip}</span>
    </td>
  );
}

// --- Insight Engine ---
function getScoreboardInsight(w: PeriodData, pw: PeriodData): Insight {
  const revDelta = delta(w.shopify.revenue, pw.shopify.revenue);
  if (revDelta.dir === "down" && revDelta.pct > 15)
    return { status: "warning", text: `Omsättningen har gått ner ${revDelta.pct}% jämfört med förra veckan. Kolla om annonserna presterar sämre eller om sajten konverterar dåligt.` };
  if (revDelta.dir === "up" && revDelta.pct > 15)
    return { status: "healthy", text: `Omsättningen har ökat ${revDelta.pct}% jämfört med förra veckan — bra momentum! Fortsätt skala det som funkar.` };
  if (w.shopify.new_pct < 30)
    return { status: "warning", text: `Bara ${w.shopify.new_pct}% nya kunder — de flesta köpen kommer från återköpare. Bra retention men acquisition kan behöva pushas.` };
  if (w.shopify.new_pct > 70)
    return { status: "healthy", text: `${w.shopify.new_pct}% nya kunder — stark kundanskaffning! Håll koll på att de kommer tillbaka och blir prenumeranter.` };
  return { status: "healthy", text: "Omsättning och ordervolym är stabila jämfört med förra veckan. Inga röda flaggor." };
}

function getPaidInsight(w: PeriodData, pw: PeriodData): Insight {
  if (w.blended_roas < 1.0)
    return { status: "critical", text: `Blended ROAS ${w.blended_roas}x — vi förlorar pengar på annonsering just nu. Varje krona vi lägger på ads ger mindre än 1 kr tillbaka. Pausa underpresterande annonser eller höj AOV.` };
  if (w.blended_roas < 2.0)
    return { status: "warning", text: `Blended ROAS ${w.blended_roas}x — vi är lönsamma men marginalen är tight. För varje 100 kr i ad spend genererar vi ${Math.round(w.blended_roas * 100)} kr i revenue. Fokusera på att optimera creatives och testa nya vinklar.` };
  const cacDelta = delta(w.cac, pw.cac);
  if (cacDelta.dir === "up" && cacDelta.pct > 20)
    return { status: "warning", text: `Meta CAC har ökat ${cacDelta.pct}% sedan förra veckan (${fmtKr(pw.cac)} → ${fmtKr(w.cac)}). Kan vara tecken på audience fatigue — testa nya målgrupper eller creatives.` };
  return { status: "healthy", text: `Blended ROAS ${w.blended_roas}x — lönsam kundanskaffning! Vi tjänar ${Math.round((w.blended_roas - 1) * 100)} kr per 100 kr i ad spend. Fortsätt skala det som funkar.` };
}

function getEconomicsInsight(w: PeriodData, breakEvenCAC: number): Insight {
  const bCAC = w.blended_cac;
  const diff = bCAC - breakEvenCAC;
  if (bCAC === 0) return { status: "healthy", text: "Inte tillräckligt med orderdata för att beräkna CAC." };
  if (diff > 100)
    return { status: "critical", text: `Blended CAC (${fmtKr(bCAC)}) är ${fmtKr(diff)} ÖVER break-even (${fmtKr(breakEvenCAC)}). Det betyder att vi förlorar ${fmtKr(diff)} per ny kund på första köpet. Akut: förbättra creatives, sänk CPC, eller höj AOV.` };
  if (diff > 0)
    return { status: "warning", text: `Blended CAC (${fmtKr(bCAC)}) är ${fmtKr(diff)} över break-even (${fmtKr(breakEvenCAC)}). Vi går alltså back ${fmtKr(diff)} per ny kund — men om de kommer tillbaka och prenumererar tjänar vi in det. Jobba på att sänka CAC genom bättre creatives.` };
  return { status: "healthy", text: `Blended CAC (${fmtKr(bCAC)}) är ${fmtKr(Math.abs(diff))} under break-even (${fmtKr(breakEvenCAC)}). Vi tjänar alltså pengar redan på första köpet — det är riktigt bra! Varje ny kund ger oss ${fmtKr(Math.abs(diff))} i marginal efter ad spend.` };
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
  // creative_health data available but not shown in current slide set

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
          <span className="pres-month">{data.week_label || data.month} — Weekly Report</span>
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
                  <Tip label="Revenue" />
                  <td className="pres-val-accent">{fmtKr(w.shopify.revenue)}</td>
                  <td><DeltaBadge curr={w.shopify.revenue} prev={pw.shopify.revenue} /></td>
                  <td>{fmtKr(m.shopify.revenue)}</td>
                </tr>
                <tr>
                  <Tip label="Orders" />
                  <td>{fmtNum(w.shopify.orders)}</td>
                  <td><DeltaBadge curr={w.shopify.orders} prev={pw.shopify.orders} /></td>
                  <td>{fmtNum(m.shopify.orders)}</td>
                </tr>
                <tr>
                  <Tip label="AOV" />
                  <td>{fmtKr(w.shopify.aov)}</td>
                  <td><DeltaBadge curr={w.shopify.aov} prev={pw.shopify.aov} /></td>
                  <td>{fmtKr(m.shopify.aov)}</td>
                </tr>
                <tr>
                  <Tip label="MRR (Subscriptions)" />
                  <td>{fmtKr(w.shopify.sub_revenue)} <span className="pres-dim">({w.shopify.sub_orders})</span></td>
                  <td><DeltaBadge curr={w.shopify.sub_revenue} prev={pw.shopify.sub_revenue} /></td>
                  <td>{fmtKr(m.shopify.sub_revenue)} <span className="pres-dim">({m.shopify.sub_orders})</span></td>
                </tr>
                <tr>
                  <Tip label="New Customers" />
                  <td>{w.shopify.new_customers} <span className="pres-dim">({w.shopify.new_pct}%)</span></td>
                  <td><DeltaBadge curr={w.shopify.new_customers} prev={pw.shopify.new_customers} /></td>
                  <td>{m.shopify.new_customers} <span className="pres-dim">({m.shopify.new_pct}%)</span></td>
                </tr>
                <tr>
                  <Tip label="Returning Customers" />
                  <td>{w.shopify.returning_customers}</td>
                  <td><DeltaBadge curr={w.shopify.returning_customers} prev={pw.shopify.returning_customers} /></td>
                  <td>{m.shopify.returning_customers}</td>
                </tr>
                <tr>
                  <Tip label={data.analytics.week.sessions > 0 ? "CR (Session→Purchase)" : "CR (Click→Purchase)"} />
                  <td className="pres-val-accent">
                    {data.analytics.week.sessions > 0 ? `${data.analytics.week.cr}%` : `${w.cr}%`}
                  </td>
                  <td>
                    <DeltaBadge
                      curr={data.analytics.week.sessions > 0 ? data.analytics.week.cr : w.cr}
                      prev={data.analytics.prev_week.sessions > 0 ? data.analytics.prev_week.cr : pw.cr}
                    />
                  </td>
                  <td className="pres-val-accent">
                    {data.analytics.mtd.sessions > 0 ? `${data.analytics.mtd.cr}%` : `${m.cr}%`}
                  </td>
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
                    <Tip label="Spend" />
                    <td>{fmtKr(w.meta.spend)}</td>
                    <td><DeltaBadge curr={w.meta.spend} prev={pw.meta.spend} inverse /></td>
                    <td>{fmtKr(m.meta.spend)}</td>
                  </tr>
                  <tr>
                    <Tip label="Blended ROAS" />
                    <td className="pres-val-accent">{w.blended_roas}x</td>
                    <td><DeltaBadge curr={w.blended_roas} prev={pw.blended_roas} /></td>
                    <td className="pres-val-accent">{m.blended_roas}x</td>
                  </tr>
                  <tr>
                    <Tip label="Meta ROAS" />
                    <td>{w.meta.roas}x</td>
                    <td><DeltaBadge curr={w.meta.roas} prev={pw.meta.roas} /></td>
                    <td>{m.meta.roas}x</td>
                  </tr>
                  <tr>
                    <Tip label="Blended CAC" />
                    <td className={w.blended_cac > weekBECAC ? "pres-val-red" : "pres-val-green"}>{fmtKr(w.blended_cac)}</td>
                    <td><DeltaBadge curr={w.blended_cac} prev={pw.blended_cac} inverse /></td>
                    <td className={m.blended_cac > mtdBECAC ? "pres-val-red" : "pres-val-green"}>{fmtKr(m.blended_cac)}</td>
                  </tr>
                  <tr>
                    <Tip label="Meta CAC" />
                    <td className="pres-dim">{fmtKr(w.cac)}</td>
                    <td><DeltaBadge curr={w.cac} prev={pw.cac} inverse /></td>
                    <td className="pres-dim">{fmtKr(m.cac)}</td>
                  </tr>
                  <tr>
                    <Tip label="Purchases" />
                    <td>{w.meta.purchases}</td>
                    <td><DeltaBadge curr={w.meta.purchases} prev={pw.meta.purchases} /></td>
                    <td>{m.meta.purchases}</td>
                  </tr>
                  <tr>
                    <Tip label="CTR" />
                    <td>{w.meta.ctr}%</td>
                    <td><DeltaBadge curr={w.meta.ctr} prev={pw.meta.ctr} /></td>
                    <td>{m.meta.ctr}%</td>
                  </tr>
                  <tr>
                    <Tip label="CR (Click→Purchase)" />
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

        {/* === SLIDE 3: ECONOMICS === */}
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
                  <Tip label="AOV" />
                  <td>{fmtKr(w.shopify.aov)}</td>
                  <td><DeltaBadge curr={w.shopify.aov} prev={pw.shopify.aov} /></td>
                  <td>{fmtKr(m.shopify.aov)}</td>
                </tr>
                <tr>
                  <Tip label="Gross Margin" />
                  <td>{fmtKr(weekMargin)} <span className="pres-dim">({weekMarginPct}%)</span></td>
                  <td><DeltaBadge curr={weekMargin} prev={pw.shopify.aov - COGS_PER_BOX} /></td>
                  <td>{fmtKr(mtdMargin)} <span className="pres-dim">({mtdMarginPct}%)</span></td>
                </tr>
                <tr>
                  <Tip label="Break-even CAC" />
                  <td className="pres-val-accent">{fmtKr(weekBECAC)}</td>
                  <td />
                  <td className="pres-val-accent">{fmtKr(mtdBECAC)}</td>
                </tr>
                <tr>
                  <Tip label="Blended CAC " />
                  <td className={w.blended_cac > weekBECAC ? "pres-val-red" : "pres-val-green"}>{fmtKr(w.blended_cac)}</td>
                  <td><DeltaBadge curr={w.blended_cac} prev={pw.blended_cac} inverse /></td>
                  <td className={m.blended_cac > mtdBECAC ? "pres-val-red" : "pres-val-green"}>{fmtKr(m.blended_cac)}</td>
                </tr>
                <tr>
                  <Tip label="CAC vs Break-even" />
                  <td className={w.blended_cac > weekBECAC ? "pres-val-red" : "pres-val-green"}>
                    {w.blended_cac > 0
                      ? w.blended_cac > weekBECAC
                        ? `+${fmtKr(w.blended_cac - weekBECAC)} over`
                        : `${fmtKr(weekBECAC - w.blended_cac)} under`
                      : "—"}
                  </td>
                  <td />
                  <td className={m.blended_cac > mtdBECAC ? "pres-val-red" : "pres-val-green"}>
                    {m.blended_cac > 0
                      ? m.blended_cac > mtdBECAC
                        ? `+${fmtKr(m.blended_cac - mtdBECAC)} over`
                        : `${fmtKr(mtdBECAC - m.blended_cac)} under`
                      : "—"}
                  </td>
                </tr>
                <tr>
                  <Tip label="Meta CAC (for reference)" />
                  <td className="pres-dim">{fmtKr(w.cac)}</td>
                  <td><DeltaBadge curr={w.cac} prev={pw.cac} inverse /></td>
                  <td className="pres-dim">{fmtKr(m.cac)}</td>
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

        {/* Creative Health slide removed */}
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
