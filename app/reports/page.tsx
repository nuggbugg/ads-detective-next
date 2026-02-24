"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageLoader, EmptyState } from "@/components/ui/Loader";
import { useToast } from "@/components/ui/Toast";
import { useCurrencyFormatter } from "@/hooks/useCurrencyFormatter";

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
  const router = useRouter();

  const [generating, setGenerating] = useState(false);

  if (!reports) return <PageLoader />;

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const id = await generateReport({});
      if (id) {
        toast.success("Report generated");
        router.push(`/reports/${id}`);
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
          icon={<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>}
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
                  onClick={() => router.push(`/reports/${r._id}`)}
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
                  <td>{(r.avg_roas ?? 0).toFixed(2)}x</td>
                  <td>{(r.avg_ctr ?? 0).toFixed(2)}%</td>
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
    </div>
  );
}
