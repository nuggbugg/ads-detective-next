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
  organizing_principle?: string;
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

type BoardData = {
  concepts: Concept[];
  variants: Variant[];
  performance?: Snapshot[];
};

type FlowColumnKey =
  | "problem_desire"
  | "hooks"
  | "concepts"
  | "designed"
  | "ready_to_test"
  | "winners";

type OrganizingPrinciple = "pain" | "desire";
type StageKey = "unaware" | "problem-aware" | "solution-aware" | "product-aware" | "most-aware";
type WizardTab = "wizard" | "board";

type WizardState = {
  principle: OrganizingPrinciple;
  selectedTrigger: string;
  audience: string;
  generatedAngles: string[];
  stageMap: Record<StageKey, string>;
  selectedFormats: string[];
};

const WIZARD_STORAGE_KEY = "creative-os-wizard-v1";

const FLOW_COLUMNS: Array<{ key: FlowColumnKey; label: string; tone: string }> = [
  { key: "problem_desire", label: "Problem / Desire", tone: "co-backlog" },
  { key: "hooks", label: "Hooks", tone: "co-drafting" },
  { key: "concepts", label: "Concepts", tone: "co-testing" },
  { key: "designed", label: "Designed", tone: "co-testing" },
  { key: "ready_to_test", label: "Ready to Test", tone: "co-scaling" },
  { key: "winners", label: "Winners", tone: "co-decided" },
];

const FUNNEL_STAGES: Array<{ key: StageKey; label: string }> = [
  { key: "unaware", label: "Unaware" },
  { key: "problem-aware", label: "Problem aware" },
  { key: "solution-aware", label: "Solution aware" },
  { key: "product-aware", label: "Product aware" },
  { key: "most-aware", label: "Most aware" },
];

const DEFAULT_STATE: WizardState = {
  principle: "pain",
  selectedTrigger: "",
  audience: "",
  generatedAngles: [],
  stageMap: {
    unaware: "",
    "problem-aware": "",
    "solution-aware": "",
    "product-aware": "",
    "most-aware": "",
  },
  selectedFormats: ["Static", "UGC"],
};

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

function buildAngles(principle: OrganizingPrinciple, trigger: string, audience: string) {
  const triggerLabel = trigger || (principle === "pain" ? "friction point" : "desired outcome");
  const audienceLabel = audience || "core audience";

  if (principle === "pain") {
    return [
      `Call out the daily pain: "${triggerLabel}" hits ${audienceLabel} hard`,
      `Before/after transformation from "${triggerLabel}" to confident routine`,
      `Myth-bust why ${audienceLabel} still struggle with ${triggerLabel}`,
      `Fast relief angle: remove "${triggerLabel}" in one simple habit`,
    ];
  }

  return [
    `Aspirational identity: ${audienceLabel} who achieve "${triggerLabel}" consistently`,
    `Future-state storytelling where "${triggerLabel}" becomes your normal`,
    `Momentum angle: small action today unlocks "${triggerLabel}" this week`,
    `Social proof angle: peers choosing the path to "${triggerLabel}"`,
  ];
}

function generateBriefs(state: WizardState) {
  const stageLabel = (stage: StageKey) => FUNNEL_STAGES.find((s) => s.key === stage)?.label ?? stage;

  return state.selectedFormats.map((format) => ({
    format,
    title: `${format} brief: ${state.selectedTrigger || "Core trigger"}`,
    audience: state.audience || "Define audience",
    principle: state.principle === "pain" ? "Pain-first" : "Desire-first",
    keyMessage:
      state.stageMap["solution-aware"] ||
      state.generatedAngles[0] ||
      "Select a message angle in step 3",
    execution:
      format === "Static"
        ? "One visual hierarchy, one promise, one CTA"
        : format === "UGC"
          ? "Creator-led hook in first 2 seconds with direct POV"
          : "Premium cinematic treatment with product truth anchored",
    funnelAnchors: FUNNEL_STAGES.filter((stage) => state.stageMap[stage.key]).map(
      (stage) => `${stageLabel(stage.key)} → ${state.stageMap[stage.key]}`
    ),
  }));
}

export default function CreativeOSPage() {
  const [data, setData] = useState<BoardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSignals, setShowSignals] = useState(false);
  const [activeTab, setActiveTab] = useState<WizardTab>("wizard");
  const [wizardState, setWizardState] = useState<WizardState>(DEFAULT_STATE);

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

  useEffect(() => {
    const raw = localStorage.getItem(WIZARD_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<WizardState>;
      setWizardState((prev) => ({
        ...prev,
        ...parsed,
        stageMap: { ...prev.stageMap, ...(parsed.stageMap || {}) },
      }));
    } catch {
      // ignore malformed local storage
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(wizardState));
  }, [wizardState]);

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

  const triggerOptions = useMemo(() => {
    const hooks = (data?.variants || []).map((v) => v.hook);
    return [...new Set(hooks)].slice(0, 12);
  }, [data]);

  const audienceOptions = useMemo(() => {
    const audiences = (data?.concepts || []).map((concept) => concept.audience || "").filter(Boolean);
    return [...new Set(audiences)];
  }, [data]);

  const briefs = useMemo(() => generateBriefs(wizardState), [wizardState]);

  const setStageAngle = (stage: StageKey, value: string) => {
    setWizardState((prev) => ({
      ...prev,
      stageMap: {
        ...prev.stageMap,
        [stage]: value,
      },
    }));
  };

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
          <p className="page-subtitle">Default flow: strategy wizard first. Board stays available for tracking.</p>
        </div>
      </div>

      <div className="creative-os-view-tabs">
        <button
          className={`btn ${activeTab === "wizard" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setActiveTab("wizard")}
          type="button"
        >
          Strategy Wizard
        </button>
        <button
          className={`btn ${activeTab === "board" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setActiveTab("board")}
          type="button"
        >
          Board Tracking
        </button>
      </div>

      {activeTab === "wizard" && (
        <div className="creative-wizard-shell">
          <section className="creative-wizard-step">
            <header>
              <span className="badge badge-purple">Step 1</span>
              <h3>Organizing principle</h3>
            </header>
            <div className="creative-wizard-grid two-col">
              <label className={`wizard-option ${wizardState.principle === "pain" ? "active" : ""}`}>
                <input
                  type="radio"
                  name="principle"
                  checked={wizardState.principle === "pain"}
                  onChange={() => setWizardState((prev) => ({ ...prev, principle: "pain" }))}
                />
                <strong>Pain-first</strong>
                <small>Lead with friction, frustration, or blockers.</small>
              </label>
              <label className={`wizard-option ${wizardState.principle === "desire" ? "active" : ""}`}>
                <input
                  type="radio"
                  name="principle"
                  checked={wizardState.principle === "desire"}
                  onChange={() => setWizardState((prev) => ({ ...prev, principle: "desire" }))}
                />
                <strong>Desire-first</strong>
                <small>Lead with aspiration, identity, and upside.</small>
              </label>
            </div>
          </section>

          <section className="creative-wizard-step">
            <header>
              <span className="badge badge-sky">Step 2</span>
              <h3>{wizardState.principle === "pain" ? "Pain" : "Desire"} + audience mapping</h3>
            </header>
            <div className="creative-wizard-grid two-col">
              <div>
                <label className="wizard-label">Core {wizardState.principle === "pain" ? "pain" : "desire"}</label>
                <input
                  className="input"
                  list="trigger-options"
                  value={wizardState.selectedTrigger}
                  onChange={(e) => setWizardState((prev) => ({ ...prev, selectedTrigger: e.target.value }))}
                  placeholder={wizardState.principle === "pain" ? "What are they struggling with?" : "What do they want?"}
                />
                <datalist id="trigger-options">
                  {triggerOptions.map((hook) => (
                    <option key={hook} value={hook} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="wizard-label">Audience</label>
                <input
                  className="input"
                  list="audience-options"
                  value={wizardState.audience}
                  onChange={(e) => setWizardState((prev) => ({ ...prev, audience: e.target.value }))}
                  placeholder="Who is this for?"
                />
                <datalist id="audience-options">
                  {audienceOptions.map((audience) => (
                    <option key={audience} value={audience} />
                  ))}
                </datalist>
              </div>
            </div>
          </section>

          <section className="creative-wizard-step">
            <header>
              <span className="badge badge-teal">Step 3</span>
              <h3>Messaging angles</h3>
              <button
                className="btn btn-secondary btn-sm"
                type="button"
                onClick={() =>
                  setWizardState((prev) => ({
                    ...prev,
                    generatedAngles: buildAngles(prev.principle, prev.selectedTrigger, prev.audience),
                  }))
                }
              >
                Generate angles
              </button>
            </header>

            <div className="wizard-angle-list">
              {(wizardState.generatedAngles.length
                ? wizardState.generatedAngles
                : ["Generate angles to map your funnel messaging."]
              ).map((angle, idx) => (
                <button
                  key={`${angle}-${idx}`}
                  className={`wizard-angle-chip ${wizardState.stageMap["solution-aware"] === angle ? "active" : ""}`}
                  type="button"
                  onClick={() => setStageAngle("solution-aware", angle)}
                >
                  {angle}
                </button>
              ))}
            </div>
          </section>

          <section className="creative-wizard-step">
            <header>
              <span className="badge badge-amber">Step 4</span>
              <h3>Funnel stage mapping</h3>
            </header>
            <div className="funnel-map-grid">
              {FUNNEL_STAGES.map((stage) => (
                <div key={stage.key} className="funnel-map-row">
                  <label>{stage.label}</label>
                  <select
                    value={wizardState.stageMap[stage.key]}
                    onChange={(e) => setStageAngle(stage.key, e.target.value)}
                  >
                    <option value="">Select angle</option>
                    {wizardState.generatedAngles.map((angle) => (
                      <option key={`${stage.key}-${angle}`} value={angle}>
                        {angle}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </section>

          <section className="creative-wizard-step">
            <header>
              <span className="badge badge-pink">Step 5</span>
              <h3>Format expansion + creative briefs</h3>
            </header>

            <div className="wizard-format-row">
              {["Static", "UGC", "HiFi"].map((format) => {
                const isActive = wizardState.selectedFormats.includes(format);
                return (
                  <button
                    key={format}
                    type="button"
                    className={`btn btn-sm ${isActive ? "btn-primary" : "btn-secondary"}`}
                    onClick={() =>
                      setWizardState((prev) => ({
                        ...prev,
                        selectedFormats: isActive
                          ? prev.selectedFormats.filter((f) => f !== format)
                          : [...prev.selectedFormats, format],
                      }))
                    }
                  >
                    {format}
                  </button>
                );
              })}
            </div>

            <div className="wizard-briefs-grid">
              {briefs.map((brief) => (
                <article key={brief.format} className="wizard-brief-card">
                  <h4>{brief.title}</h4>
                  <p>
                    <strong>Audience:</strong> {brief.audience}
                  </p>
                  <p>
                    <strong>Principle:</strong> {brief.principle}
                  </p>
                  <p>
                    <strong>Key message:</strong> {brief.keyMessage}
                  </p>
                  <p>
                    <strong>Execution:</strong> {brief.execution}
                  </p>
                  <div className="wizard-brief-tags">
                    {brief.funnelAnchors.length ? (
                      brief.funnelAnchors.map((anchor) => <span key={anchor}>{anchor}</span>)
                    ) : (
                      <span>Add funnel mappings above</span>
                    )}
                  </div>
                </article>
              ))}
              {!briefs.length && (
                <div className="empty-inline">Select at least one format to generate a brief.</div>
              )}
            </div>
          </section>
        </div>
      )}

      {activeTab === "board" && (
        <>
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
        </>
      )}
    </div>
  );
}
