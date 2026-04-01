"use client";

import { useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState, useEffect, useRef } from "react";
import { PageLoader } from "@/components/ui/Loader";
import Link from "next/link";
import { useCurrencyFormatter } from "@/hooks/useCurrencyFormatter";
import { Tip } from "@/components/ui/Tooltip";

function formatTimeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

type TimeframeOption = "7" | "14" | "30" | "90" | "custom";

function getDateRange(option: TimeframeOption, customFrom?: string, customTo?: string) {
  if (option === "custom" && customFrom) {
    return { date_from: customFrom, date_to: customTo || new Date().toISOString().slice(0, 10) };
  }
  const days = parseInt(option);
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  return {
    date_from: from.toISOString().slice(0, 10),
    date_to: to.toISOString().slice(0, 10),
  };
}

const TIMEFRAME_LABELS: Record<TimeframeOption, string> = {
  "7": "Last 7 days",
  "14": "Last 14 days",
  "30": "Last 30 days",
  "90": "Last 90 days",
  "custom": "Custom",
};

export default function DashboardPage() {
  const [timeframe, setTimeframe] = useState<TimeframeOption>("30");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [showTimeframeMenu, setShowTimeframeMenu] = useState(false);
  const timeframeRef = useRef<HTMLDivElement>(null);

  const dateRange = getDateRange(timeframe, customFrom, customTo);
  const data = useQuery(api.dashboard.get, dateRange);
  const settings = useQuery(api.settings.getAll);
  const fmt = useCurrencyFormatter();
  const fetchSales = useAction(api.shopify.fetchMonthlySales);
  const [refreshing, setRefreshing] = useState(false);
  const autoFetchedRef = useRef(false);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (timeframeRef.current && !timeframeRef.current.contains(e.target as Node)) {
        setShowTimeframeMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Auto-fetch sales on mount, and refresh every 10 minutes in the background
  useEffect(() => {
    if (!data || !data.has_shopify) return;

    const doFetch = () => {
      if (refreshing) return; // skip if already running
      setRefreshing(true);
      fetchSales()
        .catch(() => {})
        .finally(() => setRefreshing(false));
    };

    // Fetch on mount if no data or data older than 5 min
    if (!autoFetchedRef.current) {
      const stale =
        !data.sales_goal ||
        !data.sales_goal.last_fetched ||
        Date.now() - new Date(data.sales_goal.last_fetched).getTime() > 5 * 60 * 1000;
      if (stale) {
        autoFetchedRef.current = true;
        doFetch();
      }
    }

    // Background refresh every 10 minutes
    const interval = setInterval(doFetch, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [data, data?.has_shopify, data?.sales_goal?.last_fetched, fetchSales]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return <PageLoader />;

  const handleRefreshSales = async () => {
    setRefreshing(true);
    try {
      await fetchSales();
    } catch {
      // ignore — data will update reactively
    } finally {
      setRefreshing(false);
    }
  };

  const hasToken = !!settings?._has_meta_token;

  const m = data.metrics;
  const hasData = m.total_creatives > 0;
  const goal = data.campaign_goal || "roas";
  const goalLabel = goal === "lead_gen" ? "Lead Gen" : goal === "traffic" ? "Traffic" : "ROAS";

  // Goal-specific primary metric
  const goalMetric =
    goal === "lead_gen"
      ? {
          label: "Avg Cost/Lead",
          value: fmt(m.avg_cpa),
          sub: `${(m.total_leads || m.total_conversions || 0).toLocaleString()} leads`,
        }
      : goal === "traffic"
      ? {
          label: "Avg CTR",
          value: m.avg_ctr.toFixed(2) + "%",
          sub: `${m.total_clicks.toLocaleString()} clicks`,
        }
      : {
          label: "Avg ROAS",
          value: m.avg_roas.toFixed(2) + "x",
          sub: `${m.total_purchases.toLocaleString()} purchases`,
        };

  // CAC (Customer Acquisition Cost) = Total Spend / Conversions
  const cacConversions = goal === "lead_gen"
    ? (m.total_leads || m.total_conversions || 0)
    : goal === "traffic"
    ? m.total_clicks
    : m.total_purchases;
  const cacValue = cacConversions > 0 ? m.total_spend / cacConversions : 0;
  const cacLabel = goal === "lead_gen" ? "CAC (per lead)" : goal === "traffic" ? "CPC" : "CAC";

  return (
    <div className="page-content-flush">
      <div className="dash">
        {/* Summary Bar */}
        <div className="dash-summary-bar">
          <div className="dash-summary-item">
            <span className="dash-summary-dot dot-teal" />
            <span className="dash-summary-count">{m.active_ads || 0}</span>
            <Tip label="Active" />
          </div>
          <div className="dash-summary-item">
            <span className="dash-summary-dot dot-purple" />
            <span className="dash-summary-count">{m.pending_count || 0}</span>
            <Tip label="Pending analysis" />
          </div>
          <div className="dash-summary-item">
            <span className="dash-summary-dot dot-sky" />
            <span className="dash-summary-count">{m.analyzed_count || 0}</span>
            <Tip label="Analyzed" />
          </div>
          <div className="dash-summary-item">
            <span className="dash-summary-dot dot-accent" />
            <span className="dash-summary-count">{m.total_creatives || 0}</span>
            <Tip label="Total creatives" />
          </div>
          <div className="dash-summary-item">
            <span className="dash-summary-dot dot-cyan" />
            <span className="dash-summary-count">{data.accounts?.active || 0}</span>
            <span>Account{(data.accounts?.active || 0) !== 1 ? "s" : ""}</span>
          </div>
        </div>

        {/* Sales Goal Progress */}
        {data.has_shopify && data.sales_goal && (() => {
          const sg = data.sales_goal;
          const hasRevData = (sg.total_revenue || 0) > 0;
          const totalRev = sg.total_revenue || 0;
          const onlineRev = sg.online_revenue || 0;
          const b2bRev = sg.b2b_revenue || 0;
          // Use revenue if available, otherwise fall back to box counts
          const onlinePct = hasRevData
            ? totalRev > 0 ? (onlineRev / totalRev) * 100 : 100
            : sg.sold > 0 ? ((sg.online ?? sg.sold) / sg.sold) * 100 : 100;
          const b2bPct = hasRevData
            ? totalRev > 0 ? (b2bRev / totalRev) * 100 : 0
            : sg.sold > 0 ? ((sg.b2b ?? 0) / sg.sold) * 100 : 0;
          // SVG donut chart params
          const R = 40;
          const C = 2 * Math.PI * R;
          const onlineArc = (onlinePct / 100) * C;
          const b2bArc = (b2bPct / 100) * C;
          const fmtKr = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k kr` : `${n} kr`;

          return (
            <div className="goal-progress">
              <div className="goal-progress-header">
                <div className="goal-progress-title">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
                    <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" />
                  </svg>
                  <span>Monthly Sales Goal</span>
                  <span className="goal-progress-month">{sg.month}</span>
                </div>
                <button
                  className="goal-progress-refresh"
                  onClick={handleRefreshSales}
                  disabled={refreshing}
                  title="Refresh from Shopify"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16" className={refreshing ? "spin" : ""}>
                    <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" />
                  </svg>
                </button>
              </div>
              <div className="goal-progress-row">
                <div className="goal-progress-bar-section">
                  <div className="goal-progress-bar-container">
                    <div className="goal-progress-bar-track">
                      <div
                        className="goal-progress-bar-fill goal-bar-online"
                        style={{ width: `${Math.min(((sg.online ?? sg.sold) / sg.goal) * 100, 100)}%` }}
                      />
                      <div
                        className="goal-progress-bar-fill goal-bar-b2b"
                        style={{ width: `${Math.min(((sg.b2b ?? 0) / sg.goal) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="goal-progress-stats">
                    <span className="goal-progress-count">
                      <strong>{sg.sold}</strong> / {sg.goal} boxes
                    </span>
                    <span className="goal-progress-pct">
                      {Math.round((sg.sold / sg.goal) * 100)}%
                    </span>
                  </div>
                  <div className="goal-progress-legend">
                    <span className="goal-legend-item">
                      <span className="goal-legend-dot goal-legend-online" />
                      Online <strong>{sg.online ?? sg.sold}</strong>
                    </span>
                    <span className="goal-legend-item">
                      <span className="goal-legend-dot goal-legend-b2b" />
                      B2B <strong>{sg.b2b ?? 0}</strong>
                    </span>
                  </div>
                </div>
                {sg.sold > 0 && (
                  <div className="goal-revenue-donut">
                    <svg viewBox="0 0 100 100" className="donut-chart">
                      {/* Online arc */}
                      <circle
                        cx="50" cy="50" r={R}
                        fill="none"
                        stroke="var(--accent)"
                        strokeWidth="12"
                        strokeDasharray={`${onlineArc} ${C - onlineArc}`}
                        strokeDashoffset={C * 0.25}
                        strokeLinecap="round"
                      />
                      {/* B2B arc */}
                      {b2bPct > 0 && (
                        <circle
                          cx="50" cy="50" r={R}
                          fill="none"
                          stroke="#6c8cff"
                          strokeWidth="12"
                          strokeDasharray={`${b2bArc} ${C - b2bArc}`}
                          strokeDashoffset={C * 0.25 - onlineArc}
                          strokeLinecap="round"
                        />
                      )}
                      {/* Center text */}
                      <text x="50" y="46" textAnchor="middle" className="donut-total-label">
                        {hasRevData ? "Revenue" : "Boxes"}
                      </text>
                      <text x="50" y="58" textAnchor="middle" className="donut-total-value">
                        {hasRevData ? fmtKr(totalRev) : sg.sold}
                      </text>
                    </svg>
                    <div className="donut-legend">
                      <span className="donut-legend-item">
                        <span className="goal-legend-dot goal-legend-online" />
                        {hasRevData ? fmtKr(onlineRev) : `${sg.online ?? sg.sold} boxes`}{" "}
                        <span className="donut-legend-pct">({Math.round(onlinePct)}%)</span>
                      </span>
                      <span className="donut-legend-item">
                        <span className="goal-legend-dot goal-legend-b2b" />
                        {hasRevData ? fmtKr(b2bRev) : `${sg.b2b ?? 0} boxes`}{" "}
                        <span className="donut-legend-pct">({Math.round(b2bPct)}%)</span>
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}
        {data.has_shopify && !data.sales_goal && (
          <div className="goal-progress goal-progress-empty">
            <span>{refreshing ? "Loading sales data..." : "Shopify connected — waiting for data"}</span>
            {refreshing && (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16" className="spin">
                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" />
              </svg>
            )}
          </div>
        )}

        <div className="dash-content">
          <div className="dash-header">
            <div>
              <h1 className="dash-title">Overview</h1>
              <p className="dash-subtitle">
                {hasData
                  ? `${m.with_delivery} creatives with delivery across ${data.accounts.active} account${data.accounts.active !== 1 ? "s" : ""}`
                  : "Connect an account to get started"}
              </p>
            </div>
            <div className="dash-actions">
              <div className="dash-timeframe" ref={timeframeRef}>
                <button
                  className="dash-date-label dash-date-btn"
                  onClick={() => setShowTimeframeMenu((v) => !v)}
                >
                  {timeframe === "custom" && customFrom
                    ? `${customFrom} – ${customTo || "now"}`
                    : TIMEFRAME_LABELS[timeframe]}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {showTimeframeMenu && (
                  <div className="dash-timeframe-menu">
                    {(["7", "14", "30", "90"] as TimeframeOption[]).map((opt) => (
                      <button
                        key={opt}
                        className={`dash-timeframe-item${timeframe === opt ? " active" : ""}`}
                        onClick={() => { setTimeframe(opt); setShowTimeframeMenu(false); }}
                      >
                        {TIMEFRAME_LABELS[opt]}
                      </button>
                    ))}
                    <div className="dash-timeframe-divider" />
                    <div className="dash-timeframe-custom">
                      <span className="dash-timeframe-custom-label">Custom range</span>
                      <div className="dash-timeframe-custom-inputs">
                        <input
                          type="date"
                          value={customFrom}
                          onChange={(e) => setCustomFrom(e.target.value)}
                          className="dash-timeframe-date-input"
                        />
                        <span className="dash-timeframe-to">–</span>
                        <input
                          type="date"
                          value={customTo}
                          onChange={(e) => setCustomTo(e.target.value)}
                          className="dash-timeframe-date-input"
                        />
                      </div>
                      <button
                        className="dash-timeframe-apply"
                        disabled={!customFrom}
                        onClick={() => {
                          setTimeframe("custom");
                          setShowTimeframeMenu(false);
                        }}
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <span className="dash-goal-badge">{goalLabel}</span>
            </div>
          </div>

          {/* Toolbar */}
          <div className="dash-toolbar">
            <Link href="/creatives" className="dash-sort-btn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" />
              </svg>
              All Creatives
            </Link>
          </div>

          {hasData ? (
            <>
              {/* Metric Cards */}
              <div className="dash-metrics">
                <div className="dash-metric-card dash-metric-accent">
                  <div className="dash-metric-top">
                    <span className="dash-metric-label"><Tip label="Total Spend" /></span>
                    <svg className="dash-metric-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                    </svg>
                  </div>
                  <div className="dash-metric-value">{fmt(m.total_spend)}</div>
                  <div className="dash-metric-sub"><Tip label="Impressions">{m.total_impressions.toLocaleString()} impressions</Tip></div>
                </div>
                <div className="dash-metric-card">
                  <div className="dash-metric-top">
                    <span className="dash-metric-label"><Tip label={goalMetric.label} /></span>
                  </div>
                  <div className="dash-metric-value">{goalMetric.value}</div>
                  <div className="dash-metric-sub">{goalMetric.sub}</div>
                </div>
                <div className="dash-metric-card">
                  <div className="dash-metric-top">
                    <span className="dash-metric-label"><Tip label={cacLabel} /></span>
                  </div>
                  <div className="dash-metric-value">{fmt(cacValue)}</div>
                  <div className="dash-metric-sub"><Tip label="Avg CTR">{m.avg_ctr.toFixed(2)}% CTR</Tip></div>
                </div>
                {data.sales_goal && (data.sales_goal.total_revenue || 0) > 0 ? (
                  <div className="dash-metric-card">
                    <div className="dash-metric-top">
                      <span className="dash-metric-label"><Tip label="Blended ROAS" /></span>
                    </div>
                    <div className="dash-metric-value">
                      {m.all_spend > 0
                        ? ((data.sales_goal.online_revenue || 0) / m.all_spend).toFixed(2) + "x"
                        : "—"}
                    </div>
                    <div className="dash-metric-sub">
                      <Tip label="Online Revenue / All Ad Spend">
                        {fmt(data.sales_goal.online_revenue || 0)} rev / {fmt(m.all_spend)} spend
                      </Tip>
                    </div>
                  </div>
                ) : (
                  <div className="dash-metric-card">
                    <div className="dash-metric-top">
                      <span className="dash-metric-label"><Tip label="Creatives" /></span>
                    </div>
                    <div className="dash-metric-value">{m.filtered_creatives}</div>
                    <div className="dash-metric-sub"><Tip label="Active Ads">{m.filtered_active} active</Tip></div>
                  </div>
                )}
              </div>

              {/* MRR & Revenue Breakdown */}
              {data.sales_goal && (data.sales_goal.total_revenue || 0) > 0 && (() => {
                const sg = data.sales_goal;
                const subRev = sg.subscription_revenue || 0;
                const oneRev = sg.onetime_revenue || 0;
                const subOrders = sg.subscription_orders || 0;
                const oneOrders = sg.onetime_orders || 0;
                const totalRev = sg.total_revenue || 0;
                const onlineRev = sg.online_revenue || 0;
                const subPct = onlineRev > 0 ? Math.round((subRev / onlineRev) * 100) : 0;
                const onePct = 100 - subPct;
                const fmtKr = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k kr` : `${Math.round(n)} kr`;

                return (
                  <div className="dash-metrics dash-metrics-secondary">
                    <div className="dash-metric-card">
                      <div className="dash-metric-top">
                        <span className="dash-metric-label"><Tip label="MRR (Subscriptions)" /></span>
                      </div>
                      <div className="dash-metric-value">{fmtKr(subRev)}</div>
                      <div className="dash-metric-sub">{subOrders} subscription orders ({subPct}%)</div>
                    </div>
                    <div className="dash-metric-card">
                      <div className="dash-metric-top">
                        <span className="dash-metric-label"><Tip label="One-time Revenue" /></span>
                      </div>
                      <div className="dash-metric-value">{fmtKr(oneRev)}</div>
                      <div className="dash-metric-sub">{oneOrders} one-time orders ({onePct}%)</div>
                    </div>
                    <div className="dash-metric-card">
                      <div className="dash-metric-top">
                        <span className="dash-metric-label"><Tip label="Total Revenue" /></span>
                      </div>
                      <div className="dash-metric-value">{fmtKr(totalRev)}</div>
                      <div className="dash-metric-sub">{subOrders + oneOrders} total orders</div>
                    </div>
                  </div>
                );
              })()}

              <div className="dash-grid">
                {/* Top Performers */}
                <div className="dash-card dash-card-wide">
                  <div className="dash-card-header">
                    <h3><Tip label="Top Performers" /></h3>
                    <Link href="/analytics" className="btn btn-sm btn-ghost">View all</Link>
                  </div>
                  {data.top_performers.length > 0 ? (
                    <>
                      {/* Podium — top 3 overview */}
                      {data.top_performers.length >= 3 && (
                        <div className="podium">
                          {[data.top_performers[0], data.top_performers[1], data.top_performers[2]].map((p, idx) => {
                            const place = idx + 1;
                            const cls = `podium-item podium-${place === 1 ? "1st" : place === 2 ? "2nd" : "3rd"}`;
                            const metric = goal === "lead_gen"
                              ? `${fmt(p.cpa || 0)}/lead`
                              : goal === "traffic"
                              ? `${(p.ctr || 0).toFixed(2)}% CTR`
                              : `${p.roas.toFixed(2)}x`;
                            return (
                              <div className={cls} key={p._id}>
                                <div className="podium-img-wrapper">
                                  {p.image_url ? (
                                    <img src={p.image_url} alt="" />
                                  ) : (
                                    <span className="podium-placeholder">
                                      {p.ad_type === "video" ? "▶" : "⬡"}
                                    </span>
                                  )}
                                  <span className="podium-rank">{place}</span>
                                </div>
                                <span className="podium-name">
                                  {(p.ad_name || "Untitled").slice(0, 24)}
                                </span>
                                <span className="podium-metric">{metric}</span>
                                <span className="podium-sub">{fmt(p.spend)} spend</span>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Full list — all performers for easy comparison */}
                      <div className="podium-divider">
                        <span className="podium-divider-label">All performers</span>
                      </div>
                      <div className="dash-performers">
                        {data.top_performers.map((p, i) => (
                          <div className="dash-performer" key={p._id}>
                            <span className="dash-performer-rank">{i + 1}</span>
                            <div className="dash-performer-thumb">
                              {p.image_url ? (
                                <img src={p.image_url} alt="" />
                              ) : (
                                <span className="thumb-placeholder-sm">
                                  {p.ad_type === "video" ? "▶" : "⬡"}
                                </span>
                              )}
                            </div>
                            <div className="dash-performer-info">
                              <span className="dash-performer-name">
                                {(p.ad_name || "Untitled").slice(0, 40)}
                              </span>
                              <span className="dash-performer-meta">
                                {fmt(p.spend)} spend &middot;{" "}
                                {goal === "lead_gen"
                                  ? `${p.leads || p.conversions || 0} lead${(p.leads || p.conversions || 0) !== 1 ? "s" : ""}`
                                  : `${(p.ctr || 0).toFixed(2)}% CTR`}
                              </span>
                            </div>
                            <span className="dash-performer-roas">
                              {goal === "lead_gen"
                                ? `${fmt(p.cpa || 0)}/lead`
                                : goal === "traffic"
                                ? `${(p.ctr || 0).toFixed(2)}% CTR`
                                : `${p.roas.toFixed(2)}x`}
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="cell-muted" style={{ padding: "20px 0" }}>
                      No performers with sufficient spend yet
                    </p>
                  )}
                </div>

                {/* Analysis Status */}
                <div className="dash-card">
                  <div className="dash-card-header">
                    <h3><Tip label="Analysis Status" /></h3>
                  </div>
                  <div className="dash-analysis-stats">
                    <div className="dash-analysis-row">
                      <span className="dash-analysis-label">Analyzed</span>
                      <div className="dash-analysis-bar-track">
                        <div
                          className="dash-analysis-bar dash-analysis-bar-done"
                          style={{
                            width: `${m.total_creatives > 0 ? (m.analyzed_count / m.total_creatives) * 100 : 0}%`,
                          }}
                        />
                      </div>
                      <span className="dash-analysis-count">{m.analyzed_count}</span>
                    </div>
                    <div className="dash-analysis-row">
                      <span className="dash-analysis-label">Pending</span>
                      <div className="dash-analysis-bar-track">
                        <div
                          className="dash-analysis-bar dash-analysis-bar-pending"
                          style={{
                            width: `${m.total_creatives > 0 ? (m.pending_count / m.total_creatives) * 100 : 0}%`,
                          }}
                        />
                      </div>
                      <span className="dash-analysis-count">{m.pending_count}</span>
                    </div>
                    <div className="dash-analysis-row">
                      <span className="dash-analysis-label">Total</span>
                      <div className="dash-analysis-bar-track">
                        <div className="dash-analysis-bar dash-analysis-bar-total" style={{ width: "100%" }} />
                      </div>
                      <span className="dash-analysis-count">{m.total_creatives}</span>
                    </div>
                  </div>
                </div>

                {/* Accounts */}
                <div className="dash-card">
                  <div className="dash-card-header">
                    <h3>Accounts</h3>
                    <Link href="/accounts" className="btn btn-sm btn-ghost">Manage</Link>
                  </div>
                  {data.accounts.list.length > 0 ? (
                    <div className="dash-accounts-list">
                      {data.accounts.list.map((a) => (
                        <div className="dash-account-row" key={a._id}>
                          <div className={`dash-account-status ${a.is_active ? "active" : ""}`} />
                          <span className="dash-account-name">{a.name}</span>
                          <span className="dash-account-sync">
                            {a.last_synced_at ? formatTimeAgo(a.last_synced_at) : "Never synced"}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="dash-empty-accounts">
                      <p>No accounts connected</p>
                      <Link href="/accounts" className="btn btn-sm btn-primary">Add Account</Link>
                    </div>
                  )}
                </div>

                {/* Quick Actions */}
                <div className="dash-card dash-card-wide">
                  <div className="dash-card-header">
                    <h3>Quick Actions</h3>
                  </div>
                  <div className="dash-quick-actions">
                    <Link href="/creatives" className="dash-action-btn">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></svg>
                      <span>Browse Creatives</span>
                    </Link>
                    <Link href="/analytics" className="dash-action-btn">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" /><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" /><path d="M18 12a2 2 0 0 0 0 4h4v-4Z" /></svg>
                      <span>View Analytics</span>
                    </Link>
                    <Link href="/reports" className="dash-action-btn">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
                      <span>Generate Report</span>
                    </Link>
                    <Link href="/settings" className="dash-action-btn">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09" /></svg>
                      <span>Settings</span>
                    </Link>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="dash-empty">
              <div className="dash-empty-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="40" height="40">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
                </svg>
              </div>
              <h3>Welcome to Ads Detective</h3>
              <p>Connect your Meta Ads account and start analyzing your creative performance.</p>
              <div className="dash-empty-actions">
                <Link href="/settings" className="btn btn-primary">Configure Settings</Link>
                <Link href="/accounts" className="btn btn-secondary">Add Account</Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
