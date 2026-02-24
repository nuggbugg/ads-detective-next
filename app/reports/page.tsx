"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { PageLoader, EmptyState } from "@/components/ui/Loader";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import type { Id } from "@/convex/_generated/dataModel";

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
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ReportsPage() {
  const reports = useQuery(api.reports.list);
  const generateReport = useMutation(api.reports.generate);
  const toast = useToast();
  const fmt = useCurrencyFormatter();

  const [generating, setGenerating] = useState(false);
  const [selectedId, setSelectedId] = useState<Id<"reports"> | null>(null);

  if (!reports) return <PageLoader />;

  const selectedReport = reports.find((r) => r._id === selectedId);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const id = await generateReport({});
      if (id) {
        toast.success("Report generated");
        setSelectedId(id);
      } else {
        toast.warning("No data to generate report. Sync some ad accounts first.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate report");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <h2>Reports</h2>
        <button
          className="btn btn-primary"
          onClick={handleGenerate}
          disabled={generating}
        >
          {generating ? "Generating..." : "Generate Report"}
        </button>
      </div>

      {reports.length === 0 ? (
        <EmptyState
          icon='<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>'
          title="No reports yet"
          description="Generate your first report after syncing ad data."
        />
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Generated</th>
                <th>Goal</th>
                <th>Creatives</th>
                <th>Spend</th>
                <th>ROAS</th>
                <th>CTR</th>
                <th>Window</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr
                  key={r._id}
                  onClick={() => setSelectedId(r._id)}
                  style={{ cursor: "pointer" }}
                >
                  <td className="cell-primary">{formatDate(r._creationTime)}</td>
                  <td>
                    <span className="badge">
                      {r.campaign_goal === "lead_gen" ? "Lead Gen" : r.campaign_goal === "traffic" ? "Traffic" : "ROAS"}
                    </span>
                  </td>
                  <td>{r.creative_count}</td>
                  <td>{fmt(r.total_spend)}</td>
                  <td>{r.avg_roas.toFixed(2)}x</td>
                  <td>{r.avg_ctr.toFixed(2)}%</td>
                  <td className="cell-muted">
                    {r.window_start && r.window_end
                      ? `${r.window_start} — ${r.window_end}`
                      : `${r.window_days}d`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Report Detail Modal */}
      <Modal isOpen={!!selectedReport} onClose={() => setSelectedId(null)}>
        {selectedReport && (
          <>
            <div className="modal-header">
              <h3>Performance Report</h3>
              <button className="modal-close" onClick={() => setSelectedId(null)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div className="report-metrics">
                <div className="report-metric">
                  <span className="report-metric-label">Total Spend</span>
                  <span className="report-metric-value">{fmt(selectedReport.total_spend)}</span>
                </div>
                <div className="report-metric">
                  <span className="report-metric-label">Avg ROAS</span>
                  <span className="report-metric-value">{selectedReport.avg_roas.toFixed(2)}x</span>
                </div>
                <div className="report-metric">
                  <span className="report-metric-label">Avg CTR</span>
                  <span className="report-metric-value">{selectedReport.avg_ctr.toFixed(2)}%</span>
                </div>
                <div className="report-metric">
                  <span className="report-metric-label">Avg CPA</span>
                  <span className="report-metric-value">{selectedReport.avg_cpa > 0 ? fmt(selectedReport.avg_cpa) : "—"}</span>
                </div>
              </div>

              {selectedReport.comparison_data && (
                <div className="report-comparison">
                  <h4>vs. Previous Report</h4>
                  <div className="comparison-grid">
                    {[
                      { label: "Spend", delta: selectedReport.comparison_data.spend_delta, format: (v: number) => fmt(v) },
                      { label: "ROAS", delta: selectedReport.comparison_data.roas_delta, format: (v: number) => v.toFixed(2) + "x" },
                      { label: "CTR", delta: selectedReport.comparison_data.ctr_delta, format: (v: number) => v.toFixed(2) + "%" },
                      { label: "CPA", delta: selectedReport.comparison_data.cpa_delta, format: (v: number) => fmt(v) },
                    ].map(({ label, delta, format }) => (
                      <div key={label} className="comparison-item">
                        <span className="comparison-label">{label}</span>
                        <span className={`comparison-delta ${delta > 0 ? "delta-up" : delta < 0 ? "delta-down" : ""}`}>
                          {delta > 0 ? "+" : ""}{format(delta)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="report-section">
                <h4>Top 5 Performers</h4>
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr><th style={{ width: 48 }}></th><th>Ad Name</th><th>Spend</th><th>ROAS</th><th>CTR</th><th>CPA</th></tr>
                    </thead>
                    <tbody>
                      {(selectedReport.top_performers as Array<{
                        _id?: string; ad_name?: string; spend: number; roas: number; ctr: number; cpa: number;
                        image_url?: string | null; ad_type?: string;
                      }>).map((p, i) => (
                        <tr key={p._id || i}>
                          <td>
                            <div className="table-thumb">
                              {p.image_url ? (
                                <img src={p.image_url} alt="" />
                              ) : (
                                <span className="table-thumb-placeholder">
                                  {p.ad_type === "video" ? "▶" : "⬡"}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="cell-primary">{(p.ad_name || "Untitled").slice(0, 40)}</td>
                          <td>{fmt(p.spend)}</td>
                          <td>{p.roas.toFixed(2)}x</td>
                          <td>{p.ctr.toFixed(2)}%</td>
                          <td>{p.cpa > 0 ? fmt(p.cpa) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="report-section">
                <h4>Bottom 5 Performers</h4>
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr><th style={{ width: 48 }}></th><th>Ad Name</th><th>Spend</th><th>ROAS</th><th>CTR</th><th>CPA</th></tr>
                    </thead>
                    <tbody>
                      {(selectedReport.bottom_performers as Array<{
                        _id?: string; ad_name?: string; spend: number; roas: number; ctr: number; cpa: number;
                        image_url?: string | null; ad_type?: string;
                      }>).map((p, i) => (
                        <tr key={p._id || i}>
                          <td>
                            <div className="table-thumb">
                              {p.image_url ? (
                                <img src={p.image_url} alt="" />
                              ) : (
                                <span className="table-thumb-placeholder">
                                  {p.ad_type === "video" ? "▶" : "⬡"}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="cell-primary">{(p.ad_name || "Untitled").slice(0, 40)}</td>
                          <td>{fmt(p.spend)}</td>
                          <td>{p.roas.toFixed(2)}x</td>
                          <td>{p.ctr.toFixed(2)}%</td>
                          <td>{p.cpa > 0 ? fmt(p.cpa) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setSelectedId(null)}>Close</button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
