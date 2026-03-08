"use client";

import { useEffect, useMemo, useState } from "react";
import { PageLoader } from "@/components/ui/Loader";

type Variant = {
  variant_id: string;
  concept_id: string;
  stage: string;
  format: string;
  hook: string;
  angle: string;
  hypothesis: string;
  status: string;
  version: string;
};

type Concept = {
  concept_id: string;
  name: string;
  audience?: string;
};

type Snapshot = {
  variant_id: string;
  spend?: number;
  ctr?: number;
  cpl?: number;
  frequency?: number;
  thumbstop?: number;
  taken_at?: string;
};

type Decision = {
  variant_id: string;
  action: "scale" | "iterate" | "pause";
  reason: string;
  decided_at?: string;
};

type BoardData = {
  baseline?: { ctr: number; cpl: number };
  stages?: string[];
  concepts: Concept[];
  variants: Variant[];
  performance?: Snapshot[];
  decisions?: Decision[];
};

type FlowColumnKey =
  | "problem_desire"
  | "hooks"
  | "concepts"
  | "designed"
  | "ready_to_test"
  | "winners";

const FLOW_COLUMNS: Array<{ key: FlowColumnKey; label: string; tone: string }> = [
  { key: "problem_desire", label: "Problem / Desire", tone: "co-backlog" },
  { key: "hooks", label: "Hooks", tone: "co-drafting" },
  { key: "concepts", label: "Concepts", tone: "co-testing" },
  { key: "designed", label: "Designed", tone: "co-testing" },
  { key: "ready_to_test", label: "Ready to Test", tone: "co-scaling" },
  { key: "winners", label: "Winners", tone: "co-decided" },
];

const formatPct = (n?: number) => (n == null ? null : `${n.toFixed(2)}%`);
const formatMoney = (n?: number) => (n == null ? null : `${n.toFixed(2)} kr`);

function toFlowColumn(variant: Variant): FlowColumnKey {
  if (variant.status === "scaled" || variant.status === "live") return "winners";
  if (variant.status === "ready") return "ready_to_test";
  if (variant.status === "designed" || variant.status === "iterating") return "designed";
  if (variant.status === "briefed") return "concepts";
  if (variant.status === "backlog") return "hooks";

  if (variant.stage === "problem" || variant.stage === "desire") return "problem_desire";
  return "hooks";
}

export default function CreativeOSPage() {
  const [data, setData] = useState<BoardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSignals, setShowSignals] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetch("/creative-os/data.json")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => {
        if (mounted) setData(json);
      })
      .catch((e) => {
        if (mounted) setError(String(e?.message || e));
      });
    return () => {
      mounted = false;
    };
  }, []);

  const conceptsById = useMemo(() => {
    const map: Record<string, Concept> = {};
    (data?.concepts || []).forEach((concept) => {
      map[concept.concept_id] = concept;
    });
    return map;
  }, [data]);

  const latestByVariant = useMemo(() => {
    const map: Record<string, Snapshot> = {};
    (data?.performance || []).forEach((p) => {
      if (!map[p.variant_id] || (map[p.variant_id].taken_at || "") < (p.taken_at || "")) {
        map[p.variant_id] = p;
      }
    });
    return map;
  }, [data]);

  if (error) {
    return (
      <div className="page-content creative-os-page">
        <div className="empty-state">
          <div className="empty-state-icon">⚠️</div>
          <h3 className="empty-state-title">Creative OS kunde inte laddas</h3>
          <p className="empty-state-description">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return <PageLoader />;

  return (
    <div className="page-content creative-os-page">
      <div className="creative-os-header">
        <div>
          <h2>Creative OS</h2>
          <p className="page-subtitle">Creative idea flow from first spark to test-ready winners.</p>
        </div>
      </div>

      <div className="creative-os-sync-meta">
        <span>{data.variants.length} ideas on board</span>
        <label className="creative-os-signals-toggle">
          <input
            type="checkbox"
            checked={showSignals}
            onChange={(e) => setShowSignals(e.target.checked)}
          />
          Show lightweight signals
        </label>
      </div>

      <div className="creative-os-board">
        {FLOW_COLUMNS.map((column) => {
          const variants = data.variants.filter((variant) => toFlowColumn(variant) === column.key);

          return (
            <section className="creative-os-column" key={column.key}>
              <header className={`creative-os-column-header ${column.tone}`}>
                <span>{column.label}</span>
                <span className="count-badge">{variants.length}</span>
              </header>

              <div className="creative-os-cards">
                {variants.map((variant) => {
                  const concept = conceptsById[variant.concept_id];
                  const snapshot = latestByVariant[variant.variant_id];

                  return (
                    <article className="creative-os-card" key={variant.variant_id}>
                      <div className="creative-os-card-top">
                        <h3>{variant.hook}</h3>
                        <span className="badge badge-neutral">{variant.status}</span>
                      </div>

                      <div className="creative-os-meta-grid">
                        <div>
                          <span>Angle</span>
                          <strong>{variant.angle}</strong>
                        </div>
                        <div>
                          <span>Audience</span>
                          <strong>{concept?.audience || "TBD"}</strong>
                        </div>
                        <div>
                          <span>References</span>
                          <strong>{concept?.name || variant.concept_id}</strong>
                          <small>{variant.variant_id}</small>
                        </div>
                      </div>

                      {showSignals && (
                        <div className="creative-os-signals">
                          {formatPct(snapshot?.ctr) && <span>CTR {formatPct(snapshot?.ctr)}</span>}
                          {formatMoney(snapshot?.cpl) && <span>CPL {formatMoney(snapshot?.cpl)}</span>}
                          {formatMoney(snapshot?.spend) && <span>Spend {formatMoney(snapshot?.spend)}</span>}
                          {!snapshot && <span>No live data yet</span>}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
