"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { PageLoader, EmptyState } from "@/components/ui/Loader";

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

type TabView = "win-rates" | "kill-scale" | "priorities";

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<TabView>("win-rates");
  const winRatesData = useQuery(api.analytics.winRates, {});
  const killScaleData = useQuery(api.analytics.killScale, {});
  const prioritiesData = useQuery(api.analytics.iterationPriorities, {});
  const fmt = useCurrencyFormatter();

  if (!winRatesData || !killScaleData || !prioritiesData) return <PageLoader />;

  const hasData = Object.keys(winRatesData.stages).length > 0;

  return (
    <div className="page-content">
      <div className="page-header">
        <h2>Analytics</h2>
        <span className="dash-goal-badge">
          {winRatesData.goal === "lead_gen" ? "Lead Gen" : winRatesData.goal === "traffic" ? "Traffic" : "ROAS"}
        </span>
      </div>

      {/* Sub-tabs */}
      <div className="analytics-tabs">
        <button
          className={`analytics-tab ${activeTab === "win-rates" ? "active" : ""}`}
          onClick={() => setActiveTab("win-rates")}
        >
          Win Rates
        </button>
        <button
          className={`analytics-tab ${activeTab === "kill-scale" ? "active" : ""}`}
          onClick={() => setActiveTab("kill-scale")}
        >
          Kill / Scale
        </button>
        <button
          className={`analytics-tab ${activeTab === "priorities" ? "active" : ""}`}
          onClick={() => setActiveTab("priorities")}
        >
          Iteration Priorities
        </button>
      </div>

      {!hasData ? (
        <EmptyState
          icon='<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>'
          title="No analytics data yet"
          description="Sync ad accounts and analyze creatives to see insights here."
        />
      ) : (
        <>
          {/* Win Rates */}
          {activeTab === "win-rates" && (
            <div className="analytics-section">
              {Object.entries(winRatesData.stages as Record<string, {
                total: number; winners: number; win_rate: number;
                headline_metric: { label: string; formatted: string };
                total_spend: number;
                creatives: Array<{
                  _id: string; ad_name?: string; score: number;
                  primary_metric: string; secondary_metric: string;
                  spend: number;
                }>;
              }>).map(([stage, data]) => (
                <div key={stage} className="analytics-stage-card">
                  <div className="stage-header">
                    <h3>{stage}</h3>
                    <div className="stage-metrics">
                      <span className="stage-win-rate">{data.win_rate}% win rate</span>
                      <span className="stage-headline">{data.headline_metric.label}: {data.headline_metric.formatted}</span>
                      <span className="cell-muted">{data.total} creatives &middot; {fmt(data.total_spend)} spent</span>
                    </div>
                  </div>
                  <div className="table-wrapper">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Creative</th>
                          <th>Score</th>
                          <th>Primary</th>
                          <th>Secondary</th>
                          <th>Spend</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.creatives.slice(0, 10).map((c) => (
                          <tr key={c._id}>
                            <td className="cell-primary">{(c.ad_name || "Untitled").slice(0, 40)}</td>
                            <td>
                              <span className={`score-badge ${c.score >= 70 ? "score-winner" : c.score >= 40 ? "score-mid" : "score-low"}`}>
                                {c.score}
                              </span>
                            </td>
                            <td>{c.primary_metric}</td>
                            <td className="cell-muted">{c.secondary_metric}</td>
                            <td>{fmt(c.spend)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Kill / Scale */}
          {activeTab === "kill-scale" && (
            <div className="analytics-section">
              <div className="kill-scale-summary">
                <div className="ks-stat ks-scale">
                  <span className="ks-count">{killScaleData.summary.scale_count}</span>
                  <span className="ks-label">Scale</span>
                  <span className="ks-spend">{fmt(killScaleData.summary.scale_spend)}</span>
                </div>
                <div className="ks-stat ks-watch">
                  <span className="ks-count">{killScaleData.summary.watch_count}</span>
                  <span className="ks-label">Watch</span>
                </div>
                <div className="ks-stat ks-kill">
                  <span className="ks-count">{killScaleData.summary.kill_count}</span>
                  <span className="ks-label">Kill</span>
                  <span className="ks-spend">{fmt(killScaleData.summary.kill_spend)}</span>
                </div>
              </div>

              {[
                { title: "Scale", items: killScaleData.scale, className: "category-scale" },
                { title: "Watch", items: killScaleData.watch, className: "category-watch" },
                { title: "Kill", items: killScaleData.kill, className: "category-kill" },
              ].map(({ title, items, className }) => (
                items.length > 0 && (
                  <div key={title} className={`ks-section ${className}`}>
                    <h3>{title} ({items.length})</h3>
                    <div className="table-wrapper">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Creative</th>
                            <th>Spend</th>
                            <th>{winRatesData.goal === "lead_gen" ? "CPA" : winRatesData.goal === "traffic" ? "CTR" : "ROAS"}</th>
                            <th>Rationale</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.slice(0, 15).map((c) => (
                            <tr key={c._id}>
                              <td className="cell-primary">{(c.ad_name || "Untitled").slice(0, 40)}</td>
                              <td>{fmt(c.spend)}</td>
                              <td>
                                {winRatesData.goal === "lead_gen"
                                  ? (c.cpa > 0 ? fmt(c.cpa) : "—")
                                  : winRatesData.goal === "traffic"
                                  ? c.ctr.toFixed(2) + "%"
                                  : c.roas.toFixed(2) + "x"}
                              </td>
                              <td className="cell-muted">{c.rationale}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              ))}
            </div>
          )}

          {/* Iteration Priorities */}
          {activeTab === "priorities" && (
            <div className="analytics-section">
              {prioritiesData.priorities.length === 0 ? (
                <EmptyState
                  title="No priorities yet"
                  description="Analyze more creatives to see iteration priorities."
                />
              ) : (
                <div className="priorities-list">
                  {prioritiesData.priorities.map((p, i) => (
                    <div key={i} className="priority-card">
                      <div className="priority-header">
                        <span className={`priority-type priority-type-${p.type}`}>
                          {p.type === "angle_expansion" ? "Angle" : p.type === "hook_variation" ? "Hook" : "Optimize"}
                        </span>
                        <span className="priority-score">Impact: {p.score}</span>
                      </div>
                      <h4>{p.title}</h4>
                      <p className="helper-text">{p.description}</p>
                      <p className="priority-suggestion">{p.suggestion}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
