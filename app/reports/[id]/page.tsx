"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useParams, useRouter } from "next/navigation";
import { PageLoader } from "@/components/ui/Loader";
import type { Id } from "@/convex/_generated/dataModel";

/* eslint-disable @typescript-eslint/no-explicit-any */

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

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ReportDetailPage() {
  const params = useParams();
  const router = useRouter();
  const report = useQuery(api.reports.getById, {
    id: params.id as Id<"reports">,
  });
  const fmt = useCurrencyFormatter();

  if (report === undefined) return <PageLoader />;
  if (report === null)
    return (
      <div className="page-content" style={{ textAlign: "center", padding: "80px 20px" }}>
        <h2>Report not found</h2>
        <p className="cell-muted" style={{ marginTop: 8 }}>This report may have been deleted.</p>
        <button className="btn btn-secondary" style={{ marginTop: 20 }} onClick={() => router.push("/reports")}>
          &larr; Back to Reports
        </button>
      </div>
    );

  const goal = report.campaign_goal;
  const goalLabel = goal === "lead_gen" ? "Lead Generation" : goal === "traffic" ? "Traffic" : "ROAS";

  const dm = report.detailed_metrics as any;
  const fb = report.funnel_breakdown as any;
  const cm = report.creative_mix as any;
  const rec = report.recommendations as any;
  const comp = report.comparison_data as any;
  const topPerfs = report.top_performers as any[];
  const bottomPerfs = report.bottom_performers as any[];

  return (
    <div className="report-document">
      <div className="report-doc-toolbar">
        <button className="btn btn-secondary" onClick={() => router.push("/reports")}>
          &larr; Back to Reports
        </button>
        <button className="btn btn-secondary" onClick={() => window.print()}>
          Print / Export PDF
        </button>
      </div>

      <article className="report-doc-page">
        {/* ═══ Section 1: Header ═══ */}
        <header className="report-doc-header">
          <div className="report-doc-logo">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="url(#g)" />
              <path d="M10 22V14l6-4 6 4v8" stroke="#1a1a1a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <defs><linearGradient id="g" x1="0" y1="0" x2="32" y2="32"><stop stopColor="#d4f53c" /><stop offset="1" stopColor="#c8e83a" /></linearGradient></defs>
            </svg>
            <span>Ads Detective</span>
          </div>
          <h1 className="report-doc-title">Performance Report</h1>
          <div className="report-doc-meta">
            <span className="report-doc-meta-item">
              {report.window_start && report.window_end
                ? `${report.window_start} — ${report.window_end}`
                : `Last ${report.window_days} days`}
            </span>
            <span className="report-doc-meta-item">Goal: {goalLabel}</span>
            <span className="report-doc-meta-item">{report.creative_count} Creatives</span>
            <span className="report-doc-meta-item">Generated {formatDate(report._creationTime)}</span>
          </div>
        </header>

        {/* ═══ Section 2: Executive Summary ═══ */}
        <section className="report-doc-section">
          <h2 className="report-doc-section-title">Executive Summary</h2>
          <div className="report-doc-kpi-grid">
            {[
              { label: "Total Spend", value: fmt(report.total_spend), delta: comp?.spend_delta, format: (v: number) => fmt(v), inverse: true },
              { label: "ROAS", value: report.avg_roas.toFixed(2) + "x", delta: comp?.roas_delta, format: (v: number) => v.toFixed(2) + "x", inverse: false },
              { label: "CTR", value: report.avg_ctr.toFixed(2) + "%", delta: comp?.ctr_delta, format: (v: number) => v.toFixed(2) + "%", inverse: false },
              { label: "CPA", value: report.avg_cpa > 0 ? fmt(report.avg_cpa) : "—", delta: comp?.cpa_delta, format: (v: number) => fmt(v), inverse: true },
            ].map(({ label, value, delta, format, inverse }) => (
              <div key={label} className="report-doc-kpi">
                <span className="report-doc-kpi-label">{label}</span>
                <span className="report-doc-kpi-value">{value}</span>
                {delta != null && delta !== 0 && (
                  <span className={`report-doc-kpi-delta ${(inverse ? delta < 0 : delta > 0) ? "delta-positive" : "delta-negative"}`}>
                    {delta > 0 ? "+" : ""}{format(delta)} vs prev
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* ═══ Section 3: Spend & Efficiency Scorecard ═══ */}
        {dm && (
          <section className="report-doc-section">
            <h2 className="report-doc-section-title">Spend & Efficiency</h2>
            <div className="report-doc-scorecard">
              {[
                { label: "Total Spend", value: fmt(report.total_spend) },
                { label: "Revenue", value: fmt(dm.total_purchase_value) },
                { label: "Impressions", value: report.total_impressions.toLocaleString() },
                { label: "Clicks", value: dm.total_clicks.toLocaleString() },
                { label: "Conversions", value: dm.total_conversions.toLocaleString() },
                { label: "Avg CPC", value: fmt(dm.avg_cpc) },
                { label: "Avg CPM", value: fmt(dm.avg_cpm) },
                { label: "Video Thruplays", value: dm.total_video_thruplay.toLocaleString() },
              ].map((m) => (
                <div key={m.label} className="report-doc-scorecard-item">
                  <span className="scorecard-label">{m.label}</span>
                  <span className="scorecard-value">{m.value}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ═══ Section 4: Funnel Breakdown ═══ */}
        {fb && fb.stages && fb.stages.length > 0 && (
          <section className="report-doc-section">
            <h2 className="report-doc-section-title">Funnel Breakdown</h2>
            <div className="report-doc-funnel-grid">
              {fb.stages.map((stage: any) => (
                <div key={stage.stage} className="report-doc-funnel-card">
                  <h3 className="funnel-card-stage">{stage.stage}</h3>
                  <div className="funnel-card-bar">
                    <div className="funnel-card-bar-fill" style={{ width: `${Math.max(stage.spend_share_pct, 2)}%` }} />
                  </div>
                  <span className="funnel-card-bar-label">{stage.spend_share_pct}% of total spend &middot; {stage.creative_count} creatives</span>
                  <div className="funnel-card-metrics">
                    <div><span className="fcm-label">Spend</span><span className="fcm-value">{fmt(stage.total_spend)}</span></div>
                    <div><span className="fcm-label">ROAS</span><span className="fcm-value">{stage.avg_roas.toFixed(2)}x</span></div>
                    <div><span className="fcm-label">CTR</span><span className="fcm-value">{stage.avg_ctr.toFixed(2)}%</span></div>
                    <div><span className="fcm-label">CPA</span><span className="fcm-value">{stage.avg_cpa > 0 ? fmt(stage.avg_cpa) : "—"}</span></div>
                    <div><span className="fcm-label">CPC</span><span className="fcm-value">{fmt(stage.avg_cpc)}</span></div>
                    <div><span className="fcm-label">Clicks</span><span className="fcm-value">{stage.total_clicks.toLocaleString()}</span></div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ═══ Section 5: Creative Mix Analysis ═══ */}
        {cm && (
          <section className="report-doc-section">
            <h2 className="report-doc-section-title">Creative Mix Analysis</h2>
            {[
              { title: "Asset Type", data: cm.by_asset_type },
              { title: "Visual Format", data: cm.by_visual_format },
              { title: "Messaging Angle", data: cm.by_messaging_angle },
              { title: "Hook Tactic", data: cm.by_hook_tactic },
            ].map(({ title, data }) => {
              if (!data || data.length === 0) return null;
              const maxCount = Math.max(...data.map((d: any) => d.count), 1);
              return (
                <div key={title} className="report-doc-mix-group">
                  <h3 className="mix-group-title">{title}</h3>
                  <div className="mix-bar-list">
                    {data.map((item: any) => (
                      <div key={item.label} className="mix-bar-row">
                        <span className="mix-bar-label">{item.label}</span>
                        <div className="mix-bar-track">
                          <div
                            className="mix-bar-fill"
                            style={{ width: `${(item.count / maxCount) * 100}%` }}
                          />
                        </div>
                        <span className="mix-bar-count">{item.count}</span>
                        <span className="mix-bar-metric">
                          {goal === "lead_gen"
                            ? (item.avg_cpa > 0 ? fmt(item.avg_cpa) + " CPA" : "—")
                            : goal === "traffic"
                            ? item.avg_ctr.toFixed(2) + "% CTR"
                            : item.avg_roas.toFixed(2) + "x ROAS"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {cm.best_combination && (
              <div className="report-doc-best-combo">
                <h3>Best Performing Combination</h3>
                <div className="best-combo-tags">
                  <span className="badge">{cm.best_combination.asset_type}</span>
                  <span className="badge">{cm.best_combination.visual_format}</span>
                  <span className="badge">{cm.best_combination.messaging_angle}</span>
                  <span className="badge">{cm.best_combination.hook_tactic}</span>
                </div>
                <p className="best-combo-metrics">
                  {cm.best_combination.avg_roas.toFixed(2)}x ROAS &middot;{" "}
                  {cm.best_combination.avg_ctr.toFixed(2)}% CTR &middot;{" "}
                  n={cm.best_combination.sample_size}
                </p>
              </div>
            )}
          </section>
        )}

        {/* ═══ Section 6: Top Performers ═══ */}
        {topPerfs && topPerfs.length > 0 && (
          <section className="report-doc-section">
            <h2 className="report-doc-section-title">Top Performers</h2>
            <div className="report-doc-performer-list">
              {topPerfs.map((p: any, i: number) => (
                <div key={p._id || i} className="report-doc-performer-card performer-top">
                  <div className="performer-rank">#{i + 1}</div>
                  <div className="performer-media">
                    {p.image_url ? (
                      <img src={p.image_url} alt="" />
                    ) : (
                      <div className="performer-placeholder">
                        {p.ad_type === "video" ? "▶" : "⬡"}
                      </div>
                    )}
                  </div>
                  <div className="performer-info">
                    <h4>{p.ad_name || "Untitled"}</h4>
                    <div className="performer-badges">
                      {p.funnel_stage && <span className="badge">{p.funnel_stage}</span>}
                      {p.asset_type && <span className="badge">{p.asset_type}</span>}
                      {p.visual_format && <span className="badge">{p.visual_format}</span>}
                      {p.messaging_angle && <span className="badge">{p.messaging_angle}</span>}
                    </div>
                    <div className="performer-metrics-row">
                      <span>Spend: {fmt(p.spend)}</span>
                      <span>ROAS: {p.roas.toFixed(2)}x</span>
                      <span>CTR: {p.ctr.toFixed(2)}%</span>
                      <span>CPA: {p.cpa > 0 ? fmt(p.cpa) : "—"}</span>
                      <span>Clicks: {(p.clicks || 0).toLocaleString()}</span>
                      <span>Conv: {p.conversions || 0}</span>
                    </div>
                    {p.summary && <p className="performer-summary">{p.summary}</p>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ═══ Section 7: Bottom Performers & Wasted Spend ═══ */}
        {bottomPerfs && bottomPerfs.length > 0 && (
          <section className="report-doc-section">
            <h2 className="report-doc-section-title">Bottom Performers & Wasted Spend</h2>
            {rec && rec.total_wasted_spend > 0 && (
              <div className="report-doc-wasted-callout">
                <span className="wasted-label">Estimated Wasted Spend</span>
                <span className="wasted-value">{fmt(rec.total_wasted_spend)}</span>
              </div>
            )}
            <div className="report-doc-performer-list">
              {bottomPerfs.map((p: any, i: number) => (
                <div key={p._id || i} className="report-doc-performer-card performer-bottom">
                  <div className="performer-rank">#{topPerfs.length - bottomPerfs.length + i + 1}</div>
                  <div className="performer-media">
                    {p.image_url ? (
                      <img src={p.image_url} alt="" />
                    ) : (
                      <div className="performer-placeholder">
                        {p.ad_type === "video" ? "▶" : "⬡"}
                      </div>
                    )}
                  </div>
                  <div className="performer-info">
                    <h4>{p.ad_name || "Untitled"}</h4>
                    <div className="performer-badges">
                      {p.funnel_stage && <span className="badge">{p.funnel_stage}</span>}
                      {p.asset_type && <span className="badge">{p.asset_type}</span>}
                    </div>
                    <div className="performer-metrics-row">
                      <span>Spend: {fmt(p.spend)}</span>
                      <span>ROAS: {p.roas.toFixed(2)}x</span>
                      <span>CTR: {p.ctr.toFixed(2)}%</span>
                      <span>CPA: {p.cpa > 0 ? fmt(p.cpa) : "—"}</span>
                    </div>
                    {p.summary && <p className="performer-summary">{p.summary}</p>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ═══ Section 8: Recommendations ═══ */}
        {rec && (rec.scale.length > 0 || rec.kill.length > 0 || rec.iteration_priorities.length > 0) && (
          <section className="report-doc-section">
            <h2 className="report-doc-section-title">Recommendations</h2>

            {(rec.scale.length > 0 || rec.kill.length > 0) && (
              <div className="report-doc-recs-grid">
                {rec.scale.length > 0 && (
                  <div className="rec-column rec-scale">
                    <h3>Scale These ({rec.scale.length})</h3>
                    {rec.scale.map((c: any, i: number) => (
                      <div key={i} className="rec-item">
                        <strong>{(c.ad_name || "Untitled").slice(0, 40)}</strong>
                        <span className="rec-metric">{c.primary_metric}</span>
                        <p className="rec-rationale">{c.rationale}</p>
                      </div>
                    ))}
                  </div>
                )}
                {rec.kill.length > 0 && (
                  <div className="rec-column rec-kill">
                    <h3>Kill These ({rec.kill.length})</h3>
                    {rec.kill.map((c: any, i: number) => (
                      <div key={i} className="rec-item">
                        <strong>{(c.ad_name || "Untitled").slice(0, 40)}</strong>
                        <span className="rec-metric">{c.primary_metric}</span>
                        <p className="rec-rationale">{c.rationale}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {rec.iteration_priorities.length > 0 && (
              <div className="report-doc-priorities">
                <h3>What to Test Next</h3>
                {rec.iteration_priorities.map((p: any, i: number) => (
                  <div key={i} className="report-doc-priority-item">
                    <span className={`priority-type priority-type-${p.type}`}>
                      {p.type === "angle_expansion" ? "Angle" : p.type === "hook_variation" ? "Hook" : "Optimize"}
                    </span>
                    <div>
                      <strong>{p.title}</strong>
                      <p>{p.suggestion}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ═══ Section 9: vs. Previous Report ═══ */}
        {comp && (
          <section className="report-doc-section">
            <h2 className="report-doc-section-title">vs. Previous Report</h2>
            <div className="report-doc-comparison-grid">
              {[
                { label: "Spend", delta: comp.spend_delta, format: (v: number) => fmt(v) },
                { label: "ROAS", delta: comp.roas_delta, format: (v: number) => v.toFixed(2) + "x" },
                { label: "CTR", delta: comp.ctr_delta, format: (v: number) => v.toFixed(2) + "%" },
                { label: "CPA", delta: comp.cpa_delta, format: (v: number) => fmt(v) },
                { label: "Creatives", delta: comp.creative_delta, format: (v: number) => String(Math.round(v)) },
              ].map(({ label, delta, format }) => (
                <div key={label} className="doc-comparison-item">
                  <span className="doc-comparison-label">{label}</span>
                  <span className={`doc-comparison-delta ${delta > 0 ? "delta-up" : delta < 0 ? "delta-down" : ""}`}>
                    {delta > 0 ? "+" : ""}{format(delta)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Footer */}
        <footer className="report-doc-footer">
          <p>Generated by Ads Detective &middot; {formatDate(report._creationTime)}</p>
        </footer>
      </article>
    </div>
  );
}
