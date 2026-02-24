"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { PageLoader } from "@/components/ui/Loader";
import Link from "next/link";

function formatTimeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function useCurrencyFormatter() {
  const currencyData = useQuery(api.settings.getCurrency);
  return (amount: number, decimals = 2) => {
    if (!currencyData) return `$${(amount || 0).toFixed(decimals)}`;
    const num = (amount || 0).toFixed(decimals);
    return currencyData.position === "after"
      ? `${num} ${currencyData.symbol}`
      : `${currencyData.symbol}${num}`;
  };
}

export default function DashboardPage() {
  const data = useQuery(api.dashboard.get);
  const fmt = useCurrencyFormatter();

  if (!data) return <PageLoader />;

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

  return (
    <div className="page-content-flush">
      <div className="dash">
        {/* Summary Bar */}
        <div className="dash-summary-bar">
          <div className="dash-summary-item">
            <span className="dash-summary-dot dot-teal" />
            <span className="dash-summary-count">{m.active_ads || 0}</span>
            <span>Active</span>
          </div>
          <div className="dash-summary-item">
            <span className="dash-summary-dot dot-purple" />
            <span className="dash-summary-count">{m.pending_count || 0}</span>
            <span>Pending analysis</span>
          </div>
          <div className="dash-summary-item">
            <span className="dash-summary-dot dot-sky" />
            <span className="dash-summary-count">{m.analyzed_count || 0}</span>
            <span>Analyzed</span>
          </div>
          <div className="dash-summary-item">
            <span className="dash-summary-dot dot-accent" />
            <span className="dash-summary-count">{m.total_creatives || 0}</span>
            <span>Total creatives</span>
          </div>
          <div className="dash-summary-item">
            <span className="dash-summary-dot dot-cyan" />
            <span className="dash-summary-count">{data.accounts?.active || 0}</span>
            <span>Account{(data.accounts?.active || 0) !== 1 ? "s" : ""}</span>
          </div>
        </div>

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
              <span className="dash-goal-badge">{goalLabel}</span>
            </div>
          </div>

          {/* Toolbar */}
          <div className="dash-toolbar">
            <div className="dash-search">
              <svg className="dash-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
              </svg>
              <input type="text" placeholder="Search creatives, accounts..." />
            </div>
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
                    <span className="dash-metric-label">Total Spend</span>
                    <svg className="dash-metric-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                    </svg>
                  </div>
                  <div className="dash-metric-value">{fmt(m.total_spend)}</div>
                  <div className="dash-metric-sub">{m.total_impressions.toLocaleString()} impressions</div>
                </div>
                <div className="dash-metric-card">
                  <div className="dash-metric-top">
                    <span className="dash-metric-label">{goalMetric.label}</span>
                  </div>
                  <div className="dash-metric-value">{goalMetric.value}</div>
                  <div className="dash-metric-sub">{goalMetric.sub}</div>
                </div>
                <div className="dash-metric-card">
                  <div className="dash-metric-top">
                    <span className="dash-metric-label">
                      {goal === "traffic" ? "Avg CPC" : "Avg CTR"}
                    </span>
                  </div>
                  <div className="dash-metric-value">
                    {goal === "traffic"
                      ? fmt(m.total_clicks > 0 ? m.total_spend / m.total_clicks : 0)
                      : m.avg_ctr.toFixed(2) + "%"}
                  </div>
                  <div className="dash-metric-sub">{m.total_clicks.toLocaleString()} clicks</div>
                </div>
                <div className="dash-metric-card">
                  <div className="dash-metric-top">
                    <span className="dash-metric-label">Creatives</span>
                  </div>
                  <div className="dash-metric-value">{m.total_creatives}</div>
                  <div className="dash-metric-sub">{m.active_ads} active ads</div>
                </div>
              </div>

              <div className="dash-grid">
                {/* Top Performers */}
                <div className="dash-card dash-card-wide">
                  <div className="dash-card-header">
                    <h3>Top Performers</h3>
                    <Link href="/analytics" className="btn btn-sm btn-ghost">View all</Link>
                  </div>
                  {data.top_performers.length > 0 ? (
                    <>
                      {/* Podium — top 3 */}
                      {data.top_performers.length >= 3 ? (
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
                      ) : (
                        /* Fewer than 3 performers — flat list only */
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
                      )}

                      {/* Full list (all performers including top 3) */}
                      <div className="podium-divider" />
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
                    <h3>Analysis Status</h3>
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
