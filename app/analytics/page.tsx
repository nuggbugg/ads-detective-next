"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { PageLoader, EmptyState } from "@/components/ui/Loader";
import { Tip } from "@/components/ui/Tooltip";
import { useCurrencyFormatter } from "@/hooks/useCurrencyFormatter";

function formatCompact(amount: number, fmt: (n: number, d?: number) => string) {
  if (amount >= 1000000) return fmt(amount / 1000000, 1).replace(/\.0$/, "") + "M";
  if (amount >= 1000) return fmt(amount / 1000, 1).replace(/\.0$/, "") + "k";
  return fmt(amount, 0);
}

export default function AnalyticsPage() {
  const winRatesData = useQuery(api.analytics.winRates, {});
  const killScaleData = useQuery(api.analytics.killScale, {});
  const prioritiesData = useQuery(api.analytics.iterationPriorities, {});
  const fmt = useCurrencyFormatter();

  // Accordion collapse state
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  // Win rate stage tabs
  const [activeStage, setActiveStage] = useState<string | null>(null);

  if (!winRatesData || !killScaleData || !prioritiesData) return <PageLoader />;

  const stages = winRatesData.stages as Record<string, {
    total: number; winners: number; win_rate: number;
    headline_metric: { label: string; formatted: string };
    total_spend: number;
    creatives: Array<{
      _id: string; ad_name?: string; score: number;
      primary_metric: string; secondary_metric: string;
      spend: number; image_url?: string | null; ad_type?: string;
    }>;
  }>;

  const goal = winRatesData.goal || "roas";
  const hasData = Object.keys(stages).length > 0;
  const goalLabel = goal === "lead_gen" ? "Lead Gen (CPA)" : goal === "traffic" ? "Traffic (CTR)" : "Purchase ROAS";

  const stageOrder = ["TOF", "MOF", "BOF", "unclassified"];
  const stageEntries = Object.entries(stages).sort(
    (a, b) => stageOrder.indexOf(a[0]) - stageOrder.indexOf(b[0])
  );
  const currentStage = activeStage || (stageEntries.length > 0 ? stageEntries[0][0] : null);

  const toggle = (section: string) => {
    setCollapsed((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <h2>Analytics</h2>
        <span style={{ marginLeft: 12, fontSize: 13, color: "var(--text-muted)" }}>
          Goal: {goalLabel}
        </span>
      </div>

      {!hasData ? (
        <EmptyState
          icon={<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>}
          title="No analytics data yet"
          description="Sync ad accounts and analyze creatives to see insights here."
        />
      ) : (
        <>
          {/* ═══ Win Rate Analysis ═══ */}
          <div className="analytics-section">
            <div
              className={`section-header ${collapsed["win-rates"] ? "collapsed" : ""}`}
              onClick={() => toggle("win-rates")}
            >
              <h3>Win Rate Analysis</h3>
              <svg className="section-chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </div>
            <div className={`section-content ${collapsed["win-rates"] ? "collapsed" : ""}`}>
              {stageEntries.length > 0 && (
                <>
                  <div className="win-rate-tabs">
                    {stageEntries.map(([stage]) => (
                      <button
                        key={stage}
                        className={`wr-tab ${stage === currentStage ? "active" : ""}`}
                        onClick={() => setActiveStage(stage)}
                      >
                        {stage}
                      </button>
                    ))}
                  </div>
                  <p className="wr-score-hint">
                    Each bar shows how a creative ranks against others in this stage — a score of 80 means it beats 80% of creatives. Hover for breakdown.
                  </p>

                  {stageEntries.map(([stage, data]) => (
                    <div
                      key={stage}
                      className={`wr-panel ${stage === currentStage ? "" : "hidden"}`}
                    >
                      <div className="wr-summary">
                        <div className="summary-stat">
                          <div className="stat-value">{data.total}</div>
                          <div className="stat-label"><Tip label="Total" /></div>
                        </div>
                        <div className="summary-stat">
                          <div className="stat-value">{data.winners}</div>
                          <div className="stat-label"><Tip label="Winners" /></div>
                        </div>
                        <div className="summary-stat">
                          <div className="stat-value stat-highlight">{data.win_rate}%</div>
                          <div className="stat-label"><Tip label="Win Rate" /></div>
                        </div>
                        <div className="summary-stat">
                          <div className="stat-value">{data.headline_metric.formatted}</div>
                          <div className="stat-label"><Tip label={data.headline_metric.label} /></div>
                        </div>
                        <div className="summary-stat">
                          <div className="stat-value">{fmt(data.total_spend)}</div>
                          <div className="stat-label"><Tip label="Total Spend" /></div>
                        </div>
                      </div>

                      <div className="wr-list">
                        {data.creatives.slice(0, 20).map((c) => (
                          <div className="wr-item" key={c._id}>
                            <div
                              className="wr-item-score has-tip"
                              data-tip={`Score ${c.score}/100 — Beats ${c.score}% of creatives in ${stage}. Based on: ${stage === "TOF" ? "CTR (60%) + low CPM (40%)" : stage === "MOF" ? "low CPC (50%) + CTR (50%)" : goal === "lead_gen" ? "low CPA (60%) + CTR (40%)" : goal === "traffic" ? "CTR (60%) + low CPC (40%)" : "ROAS (60%) + low CPA (40%)"}`}
                            >
                              <div className="score-bar" style={{ width: `${c.score}%` }} />
                              <span className="score-value">{c.score}</span>
                            </div>
                            <div className="wr-item-thumb">
                              {c.image_url ? (
                                <img src={c.image_url} alt="" />
                              ) : (
                                <span className="wr-thumb-placeholder">
                                  {c.ad_type === "video" ? "▶" : "⬡"}
                                </span>
                              )}
                            </div>
                            <div className="wr-item-info">
                              <span className="wr-item-name">
                                {(c.ad_name || "Untitled").slice(0, 40)}
                              </span>
                              <span className="wr-item-metrics">
                                {c.primary_metric} | {c.secondary_metric} | {fmt(c.spend)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* ═══ Kill / Scale Recommendations ═══ */}
          <div className="analytics-section">
            <div
              className={`section-header ${collapsed["kill-scale"] ? "collapsed" : ""}`}
              onClick={() => toggle("kill-scale")}
            >
              <h3>Kill / Scale Recommendations</h3>
              <svg className="section-chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </div>
            <div className={`section-content ${collapsed["kill-scale"] ? "collapsed" : ""}`}>
              {killScaleData.summary && killScaleData.summary.total > 0 ? (
                <>
                  <div className="ks-summary">
                    <span className="ks-stat ks-scale has-tip" data-tip="High-performing creatives worth increasing budget on.">
                      {killScaleData.summary.scale_count} Scale ({formatCompact(killScaleData.summary.scale_spend, fmt)})
                    </span>
                    <span className="ks-stat ks-watch has-tip" data-tip="Creatives with mixed signals or insufficient data — keep monitoring.">
                      {killScaleData.summary.watch_count} Watch
                    </span>
                    <span className="ks-stat ks-kill has-tip" data-tip="Underperforming creatives that should be paused to stop wasting budget.">
                      {killScaleData.summary.kill_count} Kill ({formatCompact(killScaleData.summary.kill_spend, fmt)})
                    </span>
                  </div>

                  <div className="ks-columns">
                    {[
                      { title: "Scale", items: killScaleData.scale, type: "scale" },
                      { title: "Watch", items: killScaleData.watch, type: "watch" },
                      { title: "Kill", items: killScaleData.kill, type: "kill" },
                    ].map(({ title, items, type }) => (
                      <div key={type} className="ks-column">
                        <h4 className={`ks-column-title ks-${type}-title`}>{title}</h4>
                        {items.length > 0 ? (
                          items.slice(0, 10).map((c: any) => {
                            const metricDisplay =
                              goal === "lead_gen"
                                ? c.cpa > 0 ? `${fmt(c.cpa)} CPA` : "No conversions"
                                : goal === "traffic"
                                ? `${(c.ctr ?? 0).toFixed(2)}% CTR`
                                : `${(c.roas ?? 0).toFixed(2)}x`;
                            return (
                              <div key={c._id} className={`ks-card ks-card-${type}`}>
                                <div className="ks-card-top">
                                  <div className="ks-card-thumb">
                                    {c.image_url ? (
                                      <img src={c.image_url} alt="" />
                                    ) : (
                                      <span className="ks-thumb-placeholder">
                                        {c.ad_type === "video" ? "▶" : "⬡"}
                                      </span>
                                    )}
                                  </div>
                                  <div className="ks-card-content">
                                    <div className="ks-card-header">
                                      <span className="ks-card-name">
                                        {(c.ad_name || "Untitled").slice(0, 35)}
                                      </span>
                                      <span className="ks-card-roas">{metricDisplay}</span>
                                    </div>
                                    <div className="ks-card-metrics">
                                      {fmt(c.spend)} spend | {(c.ctr ?? 0).toFixed(2)}% CTR
                                    </div>
                                  </div>
                                </div>
                                <p className="ks-card-rationale">{c.rationale}</p>
                              </div>
                            );
                          })
                        ) : (
                          <p className="cell-muted">None</p>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="cell-muted">No creatives with sufficient spend.</p>
              )}
            </div>
          </div>

          {/* ═══ Iteration Priorities ═══ */}
          <div className="analytics-section">
            <div
              className={`section-header ${collapsed["priorities"] ? "collapsed" : ""}`}
              onClick={() => toggle("priorities")}
            >
              <h3>Iteration Priorities</h3>
              <svg className="section-chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </div>
            <div className={`section-content ${collapsed["priorities"] ? "collapsed" : ""}`}>
              {prioritiesData.priorities && prioritiesData.priorities.length > 0 ? (
                <div className="priorities-list">
                  {prioritiesData.priorities.slice(0, 15).map((p: any, i: number) => (
                    <div key={i} className="priority-card">
                      <div className="priority-rank">#{i + 1}</div>
                      <div className="priority-info">
                        <h4 className="priority-title">{p.title}</h4>
                        <p className="priority-desc">{p.description}</p>
                        {p.based_on && p.based_on.length > 0 && (
                          <div className="priority-thumbs">
                            {p.based_on.slice(0, 5).map((b: any) => (
                              <div key={b._id} className="priority-thumb" title={b.ad_name || "Untitled"}>
                                {b.image_url ? (
                                  <img src={b.image_url} alt="" />
                                ) : (
                                  <span className="priority-thumb-placeholder">
                                    {b.ad_type === "video" ? "▶" : "⬡"}
                                  </span>
                                )}
                              </div>
                            ))}
                            {p.based_on.length > 5 && (
                              <span className="priority-thumb-more">+{p.based_on.length - 5}</span>
                            )}
                          </div>
                        )}
                        <div className="priority-suggestion">
                          <strong>Next test:</strong> {p.suggestion}
                        </div>
                      </div>
                      <div className="priority-score">
                        <div className="score-circle">{p.score}</div>
                        <span><Tip label="Impact" /></span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="cell-muted">
                  Need analyzed creatives with sufficient spend to generate priorities.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
