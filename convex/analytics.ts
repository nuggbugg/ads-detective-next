import { query } from "./_generated/server";
import { v } from "convex/values";

// ── Helpers ──

function percentileRank(values: number[], value: number): number {
  if (values.length === 0) return 50;
  const below = values.filter((v) => v < value).length;
  return Math.round((below / values.length) * 100);
}

type GoalConfig = {
  goal: string;
  roasThreshold: number;
  cpaThreshold: number;
  spendThreshold: number;
};

type CurrencyFormatter = (amount: number, decimals?: number) => string;

const CURRENCY_SYMBOLS: Record<string, { symbol: string; position: "before" | "after" }> = {
  USD: { symbol: "$", position: "before" }, EUR: { symbol: "€", position: "before" },
  GBP: { symbol: "£", position: "before" }, SEK: { symbol: "kr", position: "after" },
  NOK: { symbol: "kr", position: "after" }, DKK: { symbol: "kr", position: "after" },
  ISK: { symbol: "kr", position: "after" }, CZK: { symbol: "Kč", position: "after" },
  HUF: { symbol: "Ft", position: "after" }, PLN: { symbol: "zł", position: "after" },
  RON: { symbol: "lei", position: "after" }, JPY: { symbol: "¥", position: "before" },
  CNY: { symbol: "¥", position: "before" }, KRW: { symbol: "₩", position: "before" },
  INR: { symbol: "₹", position: "before" }, BRL: { symbol: "R$", position: "before" },
  AUD: { symbol: "A$", position: "before" }, CAD: { symbol: "C$", position: "before" },
  CHF: { symbol: "CHF", position: "before" }, NZD: { symbol: "NZ$", position: "before" },
  SGD: { symbol: "S$", position: "before" }, HKD: { symbol: "HK$", position: "before" },
  TWD: { symbol: "NT$", position: "before" }, THB: { symbol: "฿", position: "before" },
  TRY: { symbol: "₺", position: "before" }, ZAR: { symbol: "R", position: "before" },
  ILS: { symbol: "₪", position: "before" }, PHP: { symbol: "₱", position: "before" },
  MXN: { symbol: "$", position: "before" },
};

function makeCurrencyFormatter(currency: string): CurrencyFormatter {
  const info = CURRENCY_SYMBOLS[currency] || { symbol: currency, position: "before" as const };
  return (amount: number, decimals = 2) => {
    const num = (amount || 0).toFixed(decimals);
    return info.position === "after" ? `${num} ${info.symbol}` : `${info.symbol}${num}`;
  };
}

// ── Win Rates ──

export const winRates = query({
  args: {
    account_id: v.optional(v.string()),
  },
  handler: async (ctx, filters) => {
    // Read settings
    const settingsRows = await ctx.db.query("settings").collect();
    const settings: Record<string, string> = {};
    for (const s of settingsRows) settings[s.key] = s.value;

    const config: GoalConfig = {
      goal: settings.campaign_goal || "roas",
      roasThreshold: parseFloat(settings.winner_roas_threshold) || 2.0,
      cpaThreshold: parseFloat(settings.winner_cpa_threshold) || 30,
      spendThreshold: parseFloat(settings.iteration_spend_threshold) || 50,
    };

    // Get active account currency
    const account = await ctx.db
      .query("ad_accounts")
      .withIndex("by_active", (q) => q.eq("is_active", true))
      .first();
    const fmt = makeCurrencyFormatter(account?.currency || "USD");

    // Get creatives with delivery
    let creatives;
    if (filters.account_id) {
      creatives = await ctx.db
        .query("creatives")
        .withIndex("by_account_id", (q) => q.eq("account_id", filters.account_id!))
        .collect();
    } else {
      creatives = await ctx.db.query("creatives").collect();
    }
    creatives = creatives.filter((c) => c.spend > 0);

    // Group by funnel stage
    const stages: Record<string, typeof creatives> = { TOF: [], MOF: [], BOF: [], unclassified: [] };
    for (const c of creatives) {
      const stage = c.funnel_stage && stages[c.funnel_stage] ? c.funnel_stage : "unclassified";
      stages[stage].push(c);
    }

    const results: Record<string, unknown> = {};

    for (const [stage, items] of Object.entries(stages)) {
      if (items.length === 0) continue;

      let scored: Array<typeof items[0] & { score: number; primary_metric: string; secondary_metric: string }>;

      if (stage === "TOF") {
        const ctrs = items.map((c) => c.ctr);
        const cpms = items.map((c) => c.cpm);
        scored = items.map((c) => ({
          ...c,
          score: Math.round(
            percentileRank(ctrs, c.ctr) * 0.6 +
            percentileRank(cpms.map((v) => -v), -c.cpm) * 0.4
          ),
          primary_metric: `CTR: ${c.ctr.toFixed(2)}%`,
          secondary_metric: `CPM: ${fmt(c.cpm)}`,
        }));
      } else if (stage === "MOF") {
        const cpcs = items.map((c) => c.cpc);
        const ctrs = items.map((c) => c.ctr);
        scored = items.map((c) => ({
          ...c,
          score: Math.round(
            percentileRank(cpcs.map((v) => -v), -c.cpc) * 0.5 +
            percentileRank(ctrs, c.ctr) * 0.5
          ),
          primary_metric: `CPC: ${fmt(c.cpc)}`,
          secondary_metric: `CTR: ${c.ctr.toFixed(2)}%`,
        }));
      } else if (config.goal === "lead_gen") {
        const cpas = items.filter((c) => c.cpa > 0).map((c) => c.cpa);
        const ctrs = items.map((c) => c.ctr);
        scored = items.map((c) => ({
          ...c,
          score: c.cpa > 0
            ? Math.round(
                percentileRank(cpas.map((v) => -v), -c.cpa) * 0.6 +
                percentileRank(ctrs, c.ctr) * 0.4
              )
            : Math.round(percentileRank(ctrs, c.ctr) * 0.5),
          primary_metric: c.cpa > 0 ? `CPA: ${fmt(c.cpa)}` : "No conversions",
          secondary_metric: `CTR: ${c.ctr.toFixed(2)}%`,
        }));
      } else if (config.goal === "traffic") {
        const ctrs = items.map((c) => c.ctr);
        const cpcs = items.map((c) => c.cpc);
        scored = items.map((c) => ({
          ...c,
          score: Math.round(
            percentileRank(ctrs, c.ctr) * 0.6 +
            percentileRank(cpcs.map((v) => -v), -c.cpc) * 0.4
          ),
          primary_metric: `CTR: ${c.ctr.toFixed(2)}%`,
          secondary_metric: `CPC: ${fmt(c.cpc)}`,
        }));
      } else {
        // ROAS goal
        const roases = items.map((c) => c.roas);
        const cpas = items.filter((c) => c.cpa > 0).map((c) => c.cpa);
        scored = items.map((c) => ({
          ...c,
          score: Math.round(
            percentileRank(roases, c.roas) * 0.6 +
            (c.cpa > 0 ? percentileRank(cpas.map((v) => -v), -c.cpa) * 0.4 : 20)
          ),
          primary_metric: `ROAS: ${c.roas.toFixed(2)}x`,
          secondary_metric: c.cpa > 0 ? `CPA: ${fmt(c.cpa)}` : "No purchases",
        }));
      }

      scored.sort((a, b) => b.score - a.score);
      const winners = scored.filter((c) => c.score >= 70);
      const totalSpend = items.reduce((s, c) => s + c.spend, 0);

      // Headline metric
      let headlineMetric;
      if (config.goal === "lead_gen") {
        const cpas = items.filter((c) => c.cpa > 0);
        const avgCpa = cpas.length > 0 ? cpas.reduce((s, c) => s + c.cpa, 0) / cpas.length : 0;
        headlineMetric = { label: "Avg CPA", value: avgCpa, formatted: fmt(avgCpa) };
      } else if (config.goal === "traffic") {
        const avgCtr = items.length > 0 ? items.reduce((s, c) => s + c.ctr, 0) / items.length : 0;
        headlineMetric = { label: "Avg CTR", value: avgCtr, formatted: `${avgCtr.toFixed(2)}%` };
      } else {
        const blendedRoas = totalSpend > 0
          ? items.reduce((s, c) => s + c.purchase_value, 0) / totalSpend
          : 0;
        headlineMetric = { label: "Blended ROAS", value: blendedRoas, formatted: `${blendedRoas.toFixed(2)}x` };
      }

      results[stage] = {
        total: items.length,
        winners: winners.length,
        win_rate: items.length > 0 ? Math.round((winners.length / items.length) * 100) : 0,
        headline_metric: headlineMetric,
        blended_roas: config.goal === "roas" ? headlineMetric.value : 0,
        total_spend: Math.round(totalSpend * 100) / 100,
        creatives: await Promise.all(scored.map(async (c) => {
          let image_url = c.thumbnail_url || null;
          if (c.image_storage_id) {
            const url = await ctx.storage.getUrl(c.image_storage_id);
            if (url) image_url = url;
          }
          return {
            _id: c._id,
            ad_name: c.ad_name,
            score: c.score,
            primary_metric: c.primary_metric,
            secondary_metric: c.secondary_metric,
            spend: c.spend,
            roas: c.roas,
            ctr: c.ctr,
            cpa: c.cpa,
            funnel_stage: c.funnel_stage,
            messaging_angle: c.messaging_angle,
            ad_type: c.ad_type,
            image_url,
          };
        })),
      };
    }

    return { goal: config.goal, stages: results };
  },
});

// ── Kill / Scale ──

export const killScale = query({
  args: {
    account_id: v.optional(v.string()),
  },
  handler: async (ctx, filters) => {
    const settingsRows = await ctx.db.query("settings").collect();
    const settings: Record<string, string> = {};
    for (const s of settingsRows) settings[s.key] = s.value;

    const config: GoalConfig = {
      goal: settings.campaign_goal || "roas",
      roasThreshold: parseFloat(settings.winner_roas_threshold) || 2.0,
      cpaThreshold: parseFloat(settings.winner_cpa_threshold) || 30,
      spendThreshold: parseFloat(settings.iteration_spend_threshold) || 50,
    };

    const account = await ctx.db
      .query("ad_accounts")
      .withIndex("by_active", (q) => q.eq("is_active", true))
      .first();
    const fmt = makeCurrencyFormatter(account?.currency || "USD");

    let creatives;
    if (filters.account_id) {
      creatives = await ctx.db
        .query("creatives")
        .withIndex("by_account_id", (q) => q.eq("account_id", filters.account_id!))
        .collect();
    } else {
      creatives = await ctx.db.query("creatives").collect();
    }
    creatives = creatives.filter((c) => c.spend > 0);

    const ctrs = creatives.map((c) => c.ctr).sort((a, b) => a - b);
    const medianCtr = ctrs.length > 0 ? ctrs[Math.floor(ctrs.length / 2)] : 0;

    type CategorizedCreative = typeof creatives[0] & { category: string; rationale: string };
    const scale: CategorizedCreative[] = [];
    const watch: CategorizedCreative[] = [];
    const kill: CategorizedCreative[] = [];

    for (const c of creatives) {
      if (c.spend < config.spendThreshold) {
        watch.push({ ...c, category: "watch", rationale: `Insufficient spend (${fmt(c.spend)} < ${fmt(config.spendThreshold)} threshold). Needs more data.` });
        continue;
      }

      if (config.goal === "lead_gen") {
        if (c.cpa > 0 && c.cpa <= config.cpaThreshold && c.ctr >= medianCtr) {
          scale.push({ ...c, category: "scale", rationale: `CPA ${fmt(c.cpa)} beats ${fmt(config.cpaThreshold)} target. CTR ${c.ctr.toFixed(2)}% above median. Strong performer.` });
        } else if (c.cpa === 0) {
          if (c.spend > config.spendThreshold * 3) {
            kill.push({ ...c, category: "kill", rationale: `${fmt(c.spend)} spent with no conversions. High spend, zero results.` });
          } else {
            watch.push({ ...c, category: "watch", rationale: `No conversions yet with ${fmt(c.spend)} spend. CTR ${c.ctr.toFixed(2)}%. Needs more data.` });
          }
        } else if (c.cpa > config.cpaThreshold * 1.5) {
          kill.push({ ...c, category: "kill", rationale: `CPA ${fmt(c.cpa)} is 50%+ above ${fmt(config.cpaThreshold)} target. ${fmt(c.spend)} spent inefficiently.` });
        } else {
          watch.push({ ...c, category: "watch", rationale: c.cpa <= config.cpaThreshold
            ? `CPA ${fmt(c.cpa)} meets target but CTR ${c.ctr.toFixed(2)}% below median. Mixed signals.`
            : `CPA ${fmt(c.cpa)} is above ${fmt(config.cpaThreshold)} target but within range. Could improve.`
          });
        }
      } else if (config.goal === "traffic") {
        const avgCpc = creatives.filter((cc) => cc.cpc > 0).reduce((s, cc) => s + cc.cpc, 0) /
          Math.max(creatives.filter((cc) => cc.cpc > 0).length, 1);

        if (c.ctr >= medianCtr * 1.3 && c.cpc <= avgCpc) {
          scale.push({ ...c, category: "scale", rationale: `CTR ${c.ctr.toFixed(2)}% well above median (${medianCtr.toFixed(2)}%). CPC ${fmt(c.cpc)} efficient.` });
        } else if (c.ctr < medianCtr * 0.5) {
          kill.push({ ...c, category: "kill", rationale: `CTR ${c.ctr.toFixed(2)}% far below median (${medianCtr.toFixed(2)}%). ${fmt(c.spend)} spent with low engagement.` });
        } else {
          watch.push({ ...c, category: "watch", rationale: `CTR ${c.ctr.toFixed(2)}% near median (${medianCtr.toFixed(2)}%). CPC ${fmt(c.cpc)}. Room to optimize.` });
        }
      } else {
        // ROAS goal
        if (c.roas >= config.roasThreshold && c.ctr >= medianCtr) {
          scale.push({ ...c, category: "scale", rationale: `ROAS ${c.roas.toFixed(2)}x meets ${config.roasThreshold}x target. CTR ${c.ctr.toFixed(2)}% above median.` });
        } else if (c.roas < config.roasThreshold * 0.5) {
          kill.push({ ...c, category: "kill", rationale: `ROAS ${c.roas.toFixed(2)}x below 50% of ${config.roasThreshold}x target. ${fmt(c.spend)} spent with poor returns.` });
        } else {
          watch.push({ ...c, category: "watch", rationale: c.roas >= config.roasThreshold
            ? `ROAS ${c.roas.toFixed(2)}x meets target but CTR ${c.ctr.toFixed(2)}% below median. Mixed signals.`
            : `ROAS ${c.roas.toFixed(2)}x below ${config.roasThreshold}x target but above 50%. Could improve.`
          });
        }
      }
    }

    // Sort
    const sortFn = config.goal === "lead_gen"
      ? (a: CategorizedCreative, b: CategorizedCreative) => (a.cpa || Infinity) - (b.cpa || Infinity)
      : config.goal === "traffic"
      ? (a: CategorizedCreative, b: CategorizedCreative) => b.ctr - a.ctr
      : (a: CategorizedCreative, b: CategorizedCreative) => b.roas - a.roas;

    const mapItem = async (c: CategorizedCreative) => {
      let image_url = c.thumbnail_url || null;
      if (c.image_storage_id) {
        const url = await ctx.storage.getUrl(c.image_storage_id);
        if (url) image_url = url;
      }
      return {
        _id: c._id, ad_name: c.ad_name, category: c.category, rationale: c.rationale,
        spend: c.spend, roas: c.roas, ctr: c.ctr, cpa: c.cpa, cpc: c.cpc, cpm: c.cpm,
        ad_type: c.ad_type, funnel_stage: c.funnel_stage, messaging_angle: c.messaging_angle,
        image_url,
      };
    };

    return {
      goal: config.goal,
      scale: await Promise.all(scale.sort(sortFn).map(mapItem)),
      watch: await Promise.all(watch.sort((a, b) => b.spend - a.spend).map(mapItem)),
      kill: await Promise.all(kill.sort((a, b) => b.spend - a.spend).map(mapItem)),
      summary: {
        total: creatives.length,
        scale_count: scale.length,
        watch_count: watch.length,
        kill_count: kill.length,
        scale_spend: Math.round(scale.reduce((s, c) => s + c.spend, 0) * 100) / 100,
        kill_spend: Math.round(kill.reduce((s, c) => s + c.spend, 0) * 100) / 100,
      },
    };
  },
});

// ── Iteration Priorities ──

export const iterationPriorities = query({
  args: {
    account_id: v.optional(v.string()),
  },
  handler: async (ctx, filters) => {
    const settingsRows = await ctx.db.query("settings").collect();
    const settings: Record<string, string> = {};
    for (const s of settingsRows) settings[s.key] = s.value;

    const config: GoalConfig = {
      goal: settings.campaign_goal || "roas",
      roasThreshold: parseFloat(settings.winner_roas_threshold) || 2.0,
      cpaThreshold: parseFloat(settings.winner_cpa_threshold) || 30,
      spendThreshold: parseFloat(settings.iteration_spend_threshold) || 50,
    };

    const account = await ctx.db
      .query("ad_accounts")
      .withIndex("by_active", (q) => q.eq("is_active", true))
      .first();
    const fmt = makeCurrencyFormatter(account?.currency || "USD");

    let allCreatives;
    if (filters.account_id) {
      allCreatives = await ctx.db
        .query("creatives")
        .withIndex("by_account_id", (q) => q.eq("account_id", filters.account_id!))
        .collect();
    } else {
      allCreatives = await ctx.db.query("creatives").collect();
    }

    const creatives = allCreatives.filter(
      (c) => c.spend > 0 && c.spend >= config.spendThreshold && c.analysis_status === "completed"
    );

    if (creatives.length === 0) return { goal: config.goal, priorities: [] };

    // Group by angle + format
    const anglePerformance: Record<string, typeof creatives> = {};
    const formatPerformance: Record<string, typeof creatives> = {};

    for (const c of creatives) {
      if (c.messaging_angle) {
        if (!anglePerformance[c.messaging_angle]) anglePerformance[c.messaging_angle] = [];
        anglePerformance[c.messaging_angle].push(c);
      }
      if (c.visual_format) {
        if (!formatPerformance[c.visual_format]) formatPerformance[c.visual_format] = [];
        formatPerformance[c.visual_format].push(c);
      }
    }

    function avgMetric(items: typeof creatives): number {
      if (config.goal === "lead_gen") {
        const withCpa = items.filter((c) => c.cpa > 0);
        return withCpa.length > 0 ? withCpa.reduce((s, c) => s + c.cpa, 0) / withCpa.length : 0;
      }
      if (config.goal === "traffic") {
        return items.reduce((s, c) => s + c.ctr, 0) / items.length;
      }
      return items.reduce((s, c) => s + c.roas, 0) / items.length;
    }

    function formatMetric(val: number): string {
      if (config.goal === "lead_gen") return `${fmt(val)} CPA`;
      if (config.goal === "traffic") return `${val.toFixed(2)}% CTR`;
      return `${val.toFixed(2)}x ROAS`;
    }

    function isGood(val: number): boolean {
      if (config.goal === "lead_gen") return val > 0 && val <= config.cpaThreshold * 1.5;
      if (config.goal === "traffic") return val > 2.0;
      return val > 1.5;
    }

    function impactScore(metricAvg: number, totalSpend: number): number {
      if (config.goal === "lead_gen") return metricAvg > 0 ? Math.round(totalSpend / metricAvg) : 0;
      return Math.round(metricAvg * totalSpend / 100);
    }

    // Resolve image URLs for creatives (for thumbnails)
    async function resolveImageUrl(c: typeof creatives[0]): Promise<string | null> {
      if (c.image_storage_id) {
        const url = await ctx.storage.getUrl(c.image_storage_id);
        if (url) return url;
      }
      return c.thumbnail_url || null;
    }

    const priorities: Array<{
      type: string; title: string; description: string; score: number;
      based_on: Array<{ _id: string; ad_name?: string; roas: number; cpa: number; ctr: number; image_url?: string | null; ad_type?: string }>;
      suggestion: string;
    }> = [];

    // Angle expansion
    for (const [angle, items] of Object.entries(anglePerformance)) {
      const avg = avgMetric(items);
      const totalSpend = items.reduce((s, c) => s + c.spend, 0);
      const formats = [...new Set(items.map((c) => c.visual_format).filter(Boolean))];
      const allFormats = Object.keys(formatPerformance);
      const untestedFormats = allFormats.filter((f) => !formats.includes(f));

      if (isGood(avg) && untestedFormats.length > 0) {
        const basedOn = await Promise.all(items.map(async (c) => ({
          _id: c._id as string, ad_name: c.ad_name, roas: c.roas, cpa: c.cpa, ctr: c.ctr,
          ad_type: c.ad_type, image_url: await resolveImageUrl(c),
        })));
        priorities.push({
          type: "angle_expansion",
          title: `Test "${angle}" in new formats`,
          description: `"${angle}" messaging averages ${formatMetric(avg)} across ${formats.join(", ")}. Try it in: ${untestedFormats.slice(0, 3).join(", ")}.`,
          score: impactScore(avg, totalSpend),
          based_on: basedOn,
          suggestion: `Create a ${untestedFormats[0]} ad using "${angle}" messaging`,
        });
      }
    }

    // Hook variation
    for (const [format, items] of Object.entries(formatPerformance)) {
      const avg = avgMetric(items);
      const totalSpend = items.reduce((s, c) => s + c.spend, 0);
      const hooks = [...new Set(items.map((c) => c.hook_tactic).filter(Boolean))];
      const allHooks = ["Question", "Bold Claim", "Statistic", "Story", "Problem Statement", "Curiosity Gap"];
      const untestedHooks = allHooks.filter((h) => !hooks.includes(h));

      if (isGood(avg) && untestedHooks.length > 0) {
        const basedOn = await Promise.all(items.map(async (c) => ({
          _id: c._id as string, ad_name: c.ad_name, roas: c.roas, cpa: c.cpa, ctr: c.ctr,
          ad_type: c.ad_type, image_url: await resolveImageUrl(c),
        })));
        priorities.push({
          type: "hook_variation",
          title: `New hooks for "${format}" format`,
          description: `"${format}" averages ${formatMetric(avg)}. Tested hooks: ${hooks.join(", ")}. Try: ${untestedHooks.slice(0, 3).join(", ")}.`,
          score: impactScore(avg, totalSpend),
          based_on: basedOn,
          suggestion: `Create a ${format} ad with a "${untestedHooks[0]}" hook`,
        });
      }
    }

    // High-spend underperformers
    for (const c of creatives) {
      const isUnderperforming = config.goal === "lead_gen"
        ? (c.cpa === 0 || c.cpa > config.cpaThreshold) && c.spend > config.spendThreshold * 3
        : config.goal === "traffic"
        ? c.ctr < 2.0 && c.spend > config.spendThreshold * 3
        : c.roas > 0 && c.roas < 1.5 && c.spend > config.spendThreshold * 3;

      if (isUnderperforming) {
        const metricStr = config.goal === "lead_gen"
          ? (c.cpa > 0 ? `${fmt(c.cpa)} CPA` : "no conversions")
          : config.goal === "traffic"
          ? `${c.ctr.toFixed(2)}% CTR`
          : `${c.roas.toFixed(2)}x ROAS`;

        const imgUrl = await resolveImageUrl(c);
        priorities.push({
          type: "optimization",
          title: `Optimize "${c.ad_name}"`,
          description: `${fmt(c.spend)} spent at ${metricStr}. High spend makes even small improvements impactful.`,
          score: config.goal === "lead_gen"
            ? Math.round(c.spend / Math.max(c.cpa, 1))
            : Math.round(c.spend * (1.5 - c.roas)),
          based_on: [{ _id: c._id as string, ad_name: c.ad_name, roas: c.roas, cpa: c.cpa, ctr: c.ctr, ad_type: c.ad_type, image_url: imgUrl }],
          suggestion: c.hook_tactic
            ? `Try a different hook (currently "${c.hook_tactic}") or adjust the offer`
            : "Test a stronger hook or clearer offer",
        });
      }
    }

    return { goal: config.goal, priorities: priorities.sort((a, b) => b.score - a.score) };
  },
});
