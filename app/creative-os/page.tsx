"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { PageLoader } from "@/components/ui/Loader";

const STAGE_META: Record<string, { label: string; tone: string }> = {
  backlog: { label: "Backlog", tone: "co-backlog" },
  drafting: { label: "Drafting", tone: "co-drafting" },
  testing: { label: "Testing", tone: "co-testing" },
  scaling: { label: "Scaling", tone: "co-scaling" },
  decided: { label: "Decided", tone: "co-decided" },
};

function pct(value: number) {
  return `${value.toFixed(2)}%`;
}

function money(value: number) {
  return `$${value.toFixed(2)}`;
}

export default function CreativeOSPage() {
  const board = useQuery(api.creativeOs.getBoard);
  const seedDemo = useMutation(api.creativeOs.seedDemoData);
  const syncPerformance = useAction(api.creativeOs.syncPerformance);
  const [busy, setBusy] = useState<"seed" | "sync" | null>(null);

  if (board === undefined) return <PageLoader />;
  if (board === null) return null;

  const seed = async () => {
    setBusy("seed");
    try {
      await seedDemo({});
    } finally {
      setBusy(null);
    }
  };

  const sync = async () => {
    setBusy("sync");
    try {
      await syncPerformance({ source: "meta_ads" });
    } finally {
      setBusy(null);
    }
  };

  const hasConcepts = board.concepts.length > 0;

  return (
    <div className="page-content creative-os-page">
      <div className="creative-os-header">
        <div>
          <h2>Creative OS</h2>
          <p className="page-subtitle">Native creative pipeline with concept → variant → performance → decision tracking.</p>
        </div>
        <div className="creative-os-actions">
          <button className="btn btn-secondary" onClick={seed} disabled={busy !== null || hasConcepts}>
            {busy === "seed" ? "Seeding..." : hasConcepts ? "Demo loaded" : "Load demo pipeline"}
          </button>
          <button className="btn btn-primary" onClick={sync} disabled={busy !== null || !hasConcepts}>
            {busy === "sync" ? "Syncing..." : "Sync performance"}
          </button>
        </div>
      </div>

      {board.last_sync && (
        <div className="creative-os-sync-meta">
          Last sync: <strong>{new Date(board.last_sync.started_at).toLocaleString()}</strong> · {board.last_sync.records_updated} variants updated
        </div>
      )}

      {!hasConcepts ? (
        <div className="empty-state">
          <div className="empty-state-icon">🧪</div>
          <h3 className="empty-state-title">No Creative OS concepts yet</h3>
          <p className="empty-state-description">
            Start by loading demo data or wire your ingestion action to push live creative concepts.
          </p>
        </div>
      ) : (
        <div className="creative-os-board">
          {board.stages.map((stageKey) => {
            const stage = STAGE_META[stageKey] || { label: stageKey, tone: "co-backlog" };
            const concepts = board.concepts.filter((concept) => concept.status === stageKey);

            return (
              <section className="creative-os-column" key={stageKey}>
                <header className={`creative-os-column-header ${stage.tone}`}>
                  <span>{stage.label}</span>
                  <span className="count-badge">{concepts.length}</span>
                </header>

                <div className="creative-os-cards">
                  {concepts.map((concept) => (
                    <article className="creative-os-card" key={concept._id}>
                      <div className="creative-os-card-top">
                        <h3>{concept.title}</h3>
                        <span className={`badge badge-${concept.priority === "high" ? "teal" : concept.priority === "medium" ? "amber" : "purple"}`}>
                          {concept.priority}
                        </span>
                      </div>
                      {concept.hypothesis && <p className="creative-os-hypothesis">{concept.hypothesis}</p>}

                      <div className="creative-os-metrics">
                        <div><span>ROAS</span><strong>{concept.metrics.roas.toFixed(2)}x</strong></div>
                        <div><span>CTR</span><strong>{pct(concept.metrics.ctr)}</strong></div>
                        <div><span>Spend</span><strong>{money(concept.metrics.spend)}</strong></div>
                      </div>

                      <div className="creative-os-variants">
                        {concept.variants.length === 0 && <p className="cell-muted">No variants yet</p>}
                        {concept.variants.map((variant) => (
                          <div className="creative-os-variant" key={variant._id}>
                            <div>
                              <strong>{variant.name}</strong>
                              <span>{variant.format || "Creative"} · {variant.channel || "Channel n/a"}</span>
                            </div>
                            <div className="creative-os-variant-metrics">
                              <span>{variant.metrics.roas.toFixed(2)}x</span>
                              <span>{pct(variant.metrics.ctr)}</span>
                              <span>{money(variant.metrics.spend)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
