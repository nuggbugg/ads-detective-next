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
  baseline: { ctr: number; cpl: number };
  stages: string[];
  concepts: Concept[];
  variants: Variant[];
  performance?: Snapshot[];
  decisions?: Decision[];
};

const STAGE_META: Record<string, { label: string; tone: string }> = {
  backlog: { label: "Backlog", tone: "co-backlog" },
  briefed: { label: "Briefed", tone: "co-drafting" },
  designed: { label: "Designed", tone: "co-testing" },
  ready: { label: "Ready", tone: "co-scaling" },
  live: { label: "Live", tone: "co-testing" },
  iterating: { label: "Iterating", tone: "co-drafting" },
  scaled: { label: "Scaled", tone: "co-scaling" },
  paused: { label: "Paused", tone: "co-decided" },
};

const pct = (n?: number) => (n == null ? "-" : `${n.toFixed(2)}%`);
const money = (n?: number) => (n == null ? "-" : `${n.toFixed(2)} kr`);

export default function CreativeOSPage() {
  const [data, setData] = useState<BoardData | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const latestByVariant = useMemo(() => {
    const map: Record<string, Snapshot> = {};
    (data?.performance || []).forEach((p) => {
      if (!map[p.variant_id] || (map[p.variant_id].taken_at || "") < (p.taken_at || "")) {
        map[p.variant_id] = p;
      }
    });
    return map;
  }, [data]);

  const latestDecision = useMemo(() => {
    const map: Record<string, Decision> = {};
    (data?.decisions || []).forEach((d) => {
      if (!map[d.variant_id] || (map[d.variant_id].decided_at || "") < (d.decided_at || "")) {
        map[d.variant_id] = d;
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

  const scaled = data.variants.filter((v) => v.status === "scaled").length;
  const iter = data.variants.filter((v) => v.status === "iterating").length;
  const paused = data.variants.filter((v) => v.status === "paused").length;

  return (
    <div className="page-content creative-os-page">
      <div className="creative-os-header">
        <div>
          <h2>Creative OS</h2>
          <p className="page-subtitle">Reseller lead pipeline + KPI board</p>
        </div>
      </div>

      <div className="creative-os-sync-meta">
        Baseline CTR: <strong>{data.baseline.ctr}%</strong> · Baseline CPL: <strong>{data.baseline.cpl} kr</strong> · Scaled: <strong>{scaled}</strong> · Iterating: <strong>{iter}</strong> · Paused: <strong>{paused}</strong>
      </div>

      <div className="creative-os-board">
        {data.stages.map((stageKey) => {
          const stage = STAGE_META[stageKey] || { label: stageKey, tone: "co-backlog" };
          const variants = data.variants.filter((v) => v.status === stageKey);

          return (
            <section className="creative-os-column" key={stageKey}>
              <header className={`creative-os-column-header ${stage.tone}`}>
                <span>{stage.label}</span>
                <span className="count-badge">{variants.length}</span>
              </header>

              <div className="creative-os-cards">
                {variants.map((variant) => {
                  const concept = data.concepts.find((c) => c.concept_id === variant.concept_id);
                  const p = latestByVariant[variant.variant_id];
                  const dec = latestDecision[variant.variant_id];
                  const decClass = dec?.action === "scale" ? "badge-teal" : dec?.action === "iterate" ? "badge-amber" : "badge-purple";

                  return (
                    <article className="creative-os-card" key={variant.variant_id}>
                      <div className="creative-os-card-top">
                        <h3>{variant.hook}</h3>
                        {dec && <span className={`badge ${decClass}`}>{dec.action}</span>}
                      </div>
                      <p className="creative-os-hypothesis">{concept?.name || variant.concept_id} · {variant.stage} · {variant.format} · {variant.version}</p>
                      <p className="creative-os-hypothesis">Hypotes: {variant.hypothesis}</p>

                      <div className="creative-os-metrics">
                        <div><span>CTR</span><strong>{pct(p?.ctr)}</strong></div>
                        <div><span>CPL</span><strong>{money(p?.cpl)}</strong></div>
                        <div><span>Spend</span><strong>{money(p?.spend)}</strong></div>
                      </div>
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
