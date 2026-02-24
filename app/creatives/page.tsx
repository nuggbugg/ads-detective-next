"use client";

import { useQuery, useAction } from "convex/react";
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

export default function CreativesPage() {
  const [filters, setFilters] = useState<{
    account_id?: string;
    ad_type?: string;
    analysis_status?: string;
    funnel_stage?: string;
    asset_type?: string;
    messaging_angle?: string;
    delivery?: string;
  }>({ delivery: "had_delivery" });

  const creatives = useQuery(api.creatives.list, filters);
  const filterOptions = useQuery(api.creatives.getFilterOptions);
  const settings = useQuery(api.settings.getAll);
  const analyzeOne = useAction(api.analysis.analyzeOne);
  const toast = useToast();
  const fmt = useCurrencyFormatter();

  const [selectedId, setSelectedId] = useState<Id<"creatives"> | null>(null);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");

  const selectedCreative = creatives?.find((c) => c._id === selectedId);
  const goal = typeof settings?.campaign_goal === "string" ? settings.campaign_goal : "roas";

  if (!creatives) return <PageLoader />;

  const handleAnalyze = async (id: Id<"creatives">) => {
    setAnalyzing(id);
    try {
      await analyzeOne({ id });
      toast.success("Analysis complete");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalyzing(null);
    }
  };

  const updateFilter = (key: string, value: string) => {
    setFilters((prev) => {
      const next = { ...prev };
      if (value) {
        (next as Record<string, string>)[key] = value;
      } else {
        delete (next as Record<string, string | undefined>)[key];
      }
      return next;
    });
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <h2>Creatives</h2>
        <div className="header-actions">
          <div className="view-toggle">
            <button
              className={`view-toggle-btn ${viewMode === "table" ? "active" : ""}`}
              onClick={() => setViewMode("table")}
            >
              Table
            </button>
            <button
              className={`view-toggle-btn ${viewMode === "cards" ? "active" : ""}`}
              onClick={() => setViewMode("cards")}
            >
              Cards
            </button>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      {filterOptions && (
        <div className="filter-bar">
          <select
            className="input input-sm"
            value={filters.delivery || ""}
            onChange={(e) => updateFilter("delivery", e.target.value)}
          >
            <option value="">All</option>
            <option value="had_delivery">Had delivery</option>
            <option value="active">Active only</option>
          </select>
          <select
            className="input input-sm"
            value={filters.ad_type || ""}
            onChange={(e) => updateFilter("ad_type", e.target.value)}
          >
            <option value="">All types</option>
            {filterOptions.ad_types.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select
            className="input input-sm"
            value={filters.funnel_stage || ""}
            onChange={(e) => updateFilter("funnel_stage", e.target.value)}
          >
            <option value="">All stages</option>
            {filterOptions.funnel_stages.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select
            className="input input-sm"
            value={filters.analysis_status || ""}
            onChange={(e) => updateFilter("analysis_status", e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="completed">Analyzed</option>
            <option value="pending">Pending</option>
          </select>
          <select
            className="input input-sm"
            value={filters.messaging_angle || ""}
            onChange={(e) => updateFilter("messaging_angle", e.target.value)}
          >
            <option value="">All angles</option>
            {filterOptions.messaging_angles.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
      )}

      {creatives.length === 0 ? (
        <EmptyState
          icon='<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>'
          title="No creatives yet"
          description="Sync an ad account to see creatives here."
        />
      ) : viewMode === "table" ? (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Ad Name</th>
                <th>Type</th>
                <th>Spend</th>
                <th>{goal === "lead_gen" ? "CPA" : goal === "traffic" ? "CTR" : "ROAS"}</th>
                <th>CTR</th>
                <th>Impressions</th>
                <th>Stage</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {creatives.map((c) => (
                <tr key={c._id} onClick={() => setSelectedId(c._id)} style={{ cursor: "pointer" }}>
                  <td>
                    <div className="table-name-cell">
                      <div className="table-thumb">
                        {c.resolved_image_url ? (
                          <img src={c.resolved_image_url} alt="" className="table-thumb-img" />
                        ) : (
                          <span className="table-thumb-placeholder">
                            {c.ad_type === "video" ? "▶" : "⬡"}
                          </span>
                        )}
                      </div>
                      <span className="cell-primary" title={c.ad_name || ""}>
                        {(c.ad_name || "Untitled").slice(0, 50)}
                      </span>
                    </div>
                  </td>
                  <td><span className="badge">{c.ad_type}</span></td>
                  <td>{fmt(c.spend)}</td>
                  <td>
                    {goal === "lead_gen"
                      ? (c.cpa > 0 ? fmt(c.cpa) : "—")
                      : goal === "traffic"
                      ? c.ctr.toFixed(2) + "%"
                      : c.roas.toFixed(2) + "x"}
                  </td>
                  <td>{c.ctr.toFixed(2)}%</td>
                  <td>{c.impressions.toLocaleString()}</td>
                  <td>{c.funnel_stage || "—"}</td>
                  <td>
                    <span className={`pill ${c.analysis_status === "completed" ? "pill-active" : "pill-inactive"}`}>
                      {c.analysis_status === "completed" ? "Analyzed" : "Pending"}
                    </span>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {c.analysis_status !== "completed" && (
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => handleAnalyze(c._id)}
                        disabled={analyzing === c._id}
                      >
                        {analyzing === c._id ? "..." : "Analyze"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="cards-grid">
          {creatives.map((c) => (
            <div
              key={c._id}
              className="creative-card"
              onClick={() => setSelectedId(c._id)}
            >
              <div className="creative-card-img">
                {c.resolved_image_url ? (
                  <img src={c.resolved_image_url} alt="" />
                ) : (
                  <div className="creative-card-placeholder">
                    {c.ad_type === "video" ? "▶" : "⬡"}
                  </div>
                )}
              </div>
              <div className="creative-card-body">
                <h4 className="creative-card-name">
                  {(c.ad_name || "Untitled").slice(0, 40)}
                </h4>
                <div className="creative-card-metrics">
                  <span>{fmt(c.spend)}</span>
                  <span>
                    {goal === "lead_gen"
                      ? (c.cpa > 0 ? fmt(c.cpa) + "/lead" : "—")
                      : goal === "traffic"
                      ? c.ctr.toFixed(2) + "% CTR"
                      : c.roas.toFixed(2) + "x ROAS"}
                  </span>
                </div>
                <div className="creative-card-tags">
                  <span className="badge">{c.ad_type}</span>
                  {c.funnel_stage && <span className="badge">{c.funnel_stage}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="cell-muted" style={{ textAlign: "center", padding: "12px" }}>
        {creatives.length} creative{creatives.length !== 1 ? "s" : ""}
      </p>

      {/* Detail Modal */}
      <Modal isOpen={!!selectedCreative} onClose={() => setSelectedId(null)}>
        {selectedCreative && (
          <>
            <button className="creative-modal-close" onClick={() => setSelectedId(null)}>
              &times;
            </button>
            <div className="creative-modal-layout">
              {/* Left: Image */}
              <div className="creative-modal-media">
                {selectedCreative.resolved_image_url ? (
                  <img src={selectedCreative.resolved_image_url} alt="" />
                ) : (
                  <div className="creative-modal-placeholder">
                    {selectedCreative.ad_type === "video" ? "▶" : "⬡"}
                  </div>
                )}
              </div>

              {/* Right: Info */}
              <div className="creative-modal-info">
                <h3 className="creative-modal-title">
                  {(selectedCreative.ad_name || "Untitled").slice(0, 60)}
                </h3>
                <div className="creative-modal-meta">
                  {selectedCreative.campaign_name && (
                    <span>{selectedCreative.campaign_name}</span>
                  )}
                  {selectedCreative.adset_name && (
                    <span>{selectedCreative.adset_name}</span>
                  )}
                  {selectedCreative.ad_status && (
                    <span className={`creative-modal-status creative-modal-status-${selectedCreative.ad_status.toLowerCase()}`}>
                      {selectedCreative.ad_status}
                    </span>
                  )}
                </div>

                <h4 className="creative-modal-section-title">Performance</h4>
                <div className="creative-modal-metrics">
                  <div className="creative-modal-metric">
                    <span className="cmm-value">{fmt(selectedCreative.spend)}</span>
                    <span className="cmm-label">Spend</span>
                  </div>
                  <div className="creative-modal-metric">
                    <span className="cmm-value">
                      {selectedCreative.cpa > 0 ? fmt(selectedCreative.cpa) : "—"}
                    </span>
                    <span className="cmm-label">Cost/Lead</span>
                  </div>
                  <div className="creative-modal-metric">
                    <span className="cmm-value">{selectedCreative.leads || selectedCreative.conversions || 0}</span>
                    <span className="cmm-label">Leads</span>
                  </div>
                  <div className="creative-modal-metric">
                    <span className="cmm-value">{selectedCreative.ctr.toFixed(2)}%</span>
                    <span className="cmm-label">CTR</span>
                  </div>
                  <div className="creative-modal-metric">
                    <span className="cmm-value">{selectedCreative.impressions.toLocaleString()}</span>
                    <span className="cmm-label">Impressions</span>
                  </div>
                  <div className="creative-modal-metric">
                    <span className="cmm-value">{selectedCreative.clicks.toLocaleString()}</span>
                    <span className="cmm-label">Clicks</span>
                  </div>
                  <div className="creative-modal-metric">
                    <span className="cmm-value">{fmt(selectedCreative.cpc)}</span>
                    <span className="cmm-label">CPC</span>
                  </div>
                  <div className="creative-modal-metric">
                    <span className="cmm-value">{selectedCreative.roas.toFixed(2)}x</span>
                    <span className="cmm-label">ROAS</span>
                  </div>
                </div>

                <h4 className="creative-modal-section-title">AI Analysis</h4>
                <div className="creative-modal-tags">
                  {[
                    { label: "Asset Type", value: selectedCreative.asset_type },
                    { label: "Visual Format", value: selectedCreative.visual_format },
                    { label: "Messaging Angle", value: selectedCreative.messaging_angle },
                    { label: "Hook Tactic", value: selectedCreative.hook_tactic },
                    { label: "Offer Type", value: selectedCreative.offer_type },
                    { label: "Funnel Stage", value: selectedCreative.funnel_stage },
                  ].filter((t) => t.value).map((t) => (
                    <div key={t.label} className="creative-modal-tag-row">
                      <span className="cmt-label">{t.label}</span>
                      <span className="badge">{t.value}</span>
                    </div>
                  ))}
                </div>

                {selectedCreative.summary && (
                  <div className="creative-modal-summary">
                    <h4 className="creative-modal-section-title">Summary</h4>
                    <p>{selectedCreative.summary}</p>
                  </div>
                )}

                <div className="creative-modal-actions">
                  {selectedCreative.analysis_status !== "completed" && (
                    <button
                      className="btn btn-primary"
                      onClick={() => handleAnalyze(selectedCreative._id)}
                      disabled={analyzing === selectedCreative._id}
                    >
                      {analyzing === selectedCreative._id ? "Analyzing..." : "Analyze with AI"}
                    </button>
                  )}
                  <button className="btn btn-secondary" onClick={() => setSelectedId(null)}>
                    Close
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
