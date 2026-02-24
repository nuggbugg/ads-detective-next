import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const reports = await ctx.db.query("reports").order("desc").collect();
    // Return only the scalar fields needed by the list page.
    // Skip parsing top_performers, bottom_performers, comparison_data, etc.
    return reports.map((r) => ({
      _id: r._id,
      _creationTime: r._creationTime,
      account_id: r.account_id,
      campaign_goal: r.campaign_goal,
      total_spend: r.total_spend,
      total_impressions: r.total_impressions,
      avg_roas: r.avg_roas,
      avg_ctr: r.avg_ctr,
      avg_cpa: r.avg_cpa,
      creative_count: r.creative_count,
      window_start: r.window_start,
      window_end: r.window_end,
      window_days: r.window_days,
    }));
  },
});

export const getById = query({
  args: { id: v.id("reports") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const r = await ctx.db.get(id);
    if (!r) return null;
    return {
      ...r,
      top_performers: JSON.parse(r.top_performers || "[]"),
      bottom_performers: JSON.parse(r.bottom_performers || "[]"),
      comparison_data: r.comparison_data ? JSON.parse(r.comparison_data) : null,
      funnel_breakdown: r.funnel_breakdown ? JSON.parse(r.funnel_breakdown) : null,
      creative_mix: r.creative_mix ? JSON.parse(r.creative_mix) : null,
      recommendations: r.recommendations ? JSON.parse(r.recommendations) : null,
      detailed_metrics: r.detailed_metrics ? JSON.parse(r.detailed_metrics) : null,
    };
  },
});

export const generate = mutation({
  args: {
    account_id: v.optional(v.string()),
  },
  handler: async (ctx, { account_id }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Unauthenticated");
    // Get creatives with delivery
    let creatives;
    if (account_id) {
      creatives = await ctx.db
        .query("creatives")
        .withIndex("by_account_id", (q) => q.eq("account_id", account_id))
        .collect();
    } else {
      creatives = await ctx.db.query("creatives").collect();
    }
    creatives = creatives.filter((c) => c.spend > 0);

    if (creatives.length === 0) return null;

    // ── Aggregate metrics ──
    const totalSpend = creatives.reduce((s, c) => s + c.spend, 0);
    const totalImpressions = creatives.reduce((s, c) => s + c.impressions, 0);
    const totalPurchaseValue = creatives.reduce((s, c) => s + c.purchase_value, 0);
    const avgRoas = totalSpend > 0 ? totalPurchaseValue / totalSpend : 0;
    const avgCtr = creatives.length > 0 ? creatives.reduce((s, c) => s + c.ctr, 0) / creatives.length : 0;
    const totalConversions = creatives.reduce((s, c) => s + c.conversions, 0);
    const avgCpa = totalConversions > 0 ? totalSpend / totalConversions : 0;

    // ── Detailed metrics ──
    const totalClicks = creatives.reduce((s, c) => s + c.clicks, 0);
    const totalPurchases = creatives.reduce((s, c) => s + c.purchases, 0);
    const totalLeads = creatives.reduce((s, c) => s + c.leads, 0);
    const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
    const avgCpm = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0;
    const totalVideoThruplay = creatives.reduce((s, c) => s + c.video_thruplay, 0);
    const totalVideoP100 = creatives.reduce((s, c) => s + c.video_p100, 0);

    const detailedMetrics = {
      total_clicks: totalClicks,
      total_conversions: totalConversions,
      total_purchases: totalPurchases,
      total_leads: totalLeads,
      total_purchase_value: Math.round(totalPurchaseValue * 100) / 100,
      avg_cpc: Math.round(avgCpc * 100) / 100,
      avg_cpm: Math.round(avgCpm * 100) / 100,
      total_video_thruplay: totalVideoThruplay,
      total_video_views_p100: totalVideoP100,
    };

    // ── Get settings ──
    const goalSetting = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "campaign_goal"))
      .first();
    const goal = goalSetting?.value || "roas";

    const spendSetting = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "iteration_spend_threshold"))
      .first();
    const spendThreshold = parseFloat(spendSetting?.value || "50");

    const dateRangeSetting = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "date_range_days"))
      .first();
    const windowDays = parseInt(dateRangeSetting?.value || "30");

    const roasThresholdSetting = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "winner_roas_threshold"))
      .first();
    const roasThreshold = parseFloat(roasThresholdSetting?.value || "2.0");

    const cpaThresholdSetting = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "winner_cpa_threshold"))
      .first();
    const cpaThreshold = parseFloat(cpaThresholdSetting?.value || "30");

    // ── Funnel breakdown ──
    const funnelGroups: Record<string, typeof creatives> = {};
    for (const c of creatives) {
      const stage = c.funnel_stage || "Unclassified";
      if (!funnelGroups[stage]) funnelGroups[stage] = [];
      funnelGroups[stage].push(c);
    }

    const funnelBreakdown = {
      stages: Object.entries(funnelGroups).map(([stage, items]) => {
        const stageSpend = items.reduce((s, c) => s + c.spend, 0);
        const stageImpressions = items.reduce((s, c) => s + c.impressions, 0);
        const stageClicks = items.reduce((s, c) => s + c.clicks, 0);
        const stageConversions = items.reduce((s, c) => s + c.conversions, 0);
        const stagePV = items.reduce((s, c) => s + c.purchase_value, 0);
        return {
          stage,
          creative_count: items.length,
          total_spend: Math.round(stageSpend * 100) / 100,
          total_impressions: stageImpressions,
          total_clicks: stageClicks,
          total_conversions: stageConversions,
          avg_ctr: items.length > 0 ? Math.round((items.reduce((s, c) => s + c.ctr, 0) / items.length) * 100) / 100 : 0,
          avg_cpc: stageClicks > 0 ? Math.round((stageSpend / stageClicks) * 100) / 100 : 0,
          avg_cpm: stageImpressions > 0 ? Math.round(((stageSpend / stageImpressions) * 1000) * 100) / 100 : 0,
          avg_roas: stageSpend > 0 ? Math.round((stagePV / stageSpend) * 100) / 100 : 0,
          avg_cpa: stageConversions > 0 ? Math.round((stageSpend / stageConversions) * 100) / 100 : 0,
          spend_share_pct: totalSpend > 0 ? Math.round((stageSpend / totalSpend) * 1000) / 10 : 0,
        };
      }).sort((a, b) => b.total_spend - a.total_spend),
    };

    // ── Creative mix analysis ──
    const analyzedCreatives = creatives.filter((c) => c.analysis_status === "completed");

    function buildMixGroup(
      items: typeof analyzedCreatives,
      fieldExtractor: (c: typeof analyzedCreatives[0]) => string | undefined
    ) {
      const groups: Record<string, typeof items> = {};
      for (const c of items) {
        const val = fieldExtractor(c) || "Unknown";
        if (!groups[val]) groups[val] = [];
        groups[val].push(c);
      }
      return Object.entries(groups)
        .map(([label, grp]) => {
          const spend = grp.reduce((s, c) => s + c.spend, 0);
          const pv = grp.reduce((s, c) => s + c.purchase_value, 0);
          const convs = grp.reduce((s, c) => s + c.conversions, 0);
          return {
            label,
            count: grp.length,
            total_spend: Math.round(spend * 100) / 100,
            avg_roas: spend > 0 ? Math.round((pv / spend) * 100) / 100 : 0,
            avg_ctr: grp.length > 0 ? Math.round((grp.reduce((s, c) => s + c.ctr, 0) / grp.length) * 100) / 100 : 0,
            avg_cpa: convs > 0 ? Math.round((spend / convs) * 100) / 100 : 0,
          };
        })
        .sort((a, b) => b.count - a.count);
    }

    const creativeMix: {
      by_asset_type: ReturnType<typeof buildMixGroup>;
      by_visual_format: ReturnType<typeof buildMixGroup>;
      by_messaging_angle: ReturnType<typeof buildMixGroup>;
      by_hook_tactic: ReturnType<typeof buildMixGroup>;
      best_combination: { asset_type: string; visual_format: string; messaging_angle: string; hook_tactic: string; avg_roas: number; avg_ctr: number; sample_size: number } | null;
    } = {
      by_asset_type: buildMixGroup(analyzedCreatives, (c) => c.asset_type),
      by_visual_format: buildMixGroup(analyzedCreatives, (c) => c.visual_format),
      by_messaging_angle: buildMixGroup(analyzedCreatives, (c) => c.messaging_angle),
      by_hook_tactic: buildMixGroup(analyzedCreatives, (c) => c.hook_tactic),
      best_combination: null,
    };

    // Find best combination (n >= 2)
    const combos: Record<string, typeof analyzedCreatives> = {};
    for (const c of analyzedCreatives) {
      if (c.asset_type && c.visual_format && c.messaging_angle && c.hook_tactic) {
        const key = `${c.asset_type}|${c.visual_format}|${c.messaging_angle}|${c.hook_tactic}`;
        if (!combos[key]) combos[key] = [];
        combos[key].push(c);
      }
    }
    let bestComboScore = -Infinity;
    for (const [key, items] of Object.entries(combos)) {
      if (items.length < 2) continue;
      const spend = items.reduce((s, c) => s + c.spend, 0);
      const pv = items.reduce((s, c) => s + c.purchase_value, 0);
      const score = goal === "lead_gen"
        ? -(items.reduce((s, c) => s + c.cpa, 0) / items.length)
        : goal === "traffic"
        ? items.reduce((s, c) => s + c.ctr, 0) / items.length
        : spend > 0 ? pv / spend : 0;
      if (score > bestComboScore) {
        bestComboScore = score;
        const [at, vf, ma, ht] = key.split("|");
        creativeMix.best_combination = {
          asset_type: at, visual_format: vf, messaging_angle: ma, hook_tactic: ht,
          avg_roas: spend > 0 ? Math.round((pv / spend) * 100) / 100 : 0,
          avg_ctr: Math.round((items.reduce((s, c) => s + c.ctr, 0) / items.length) * 100) / 100,
          sample_size: items.length,
        };
      }
    }

    // ── Recommendations (Kill/Scale) ──
    const ctrs = creatives.map((c) => c.ctr).sort((a, b) => a - b);
    const medianCtr = ctrs.length > 0 ? ctrs[Math.floor(ctrs.length / 2)] : 0;

    type RecItem = { ad_name: string; spend: number; primary_metric: string; rationale: string; image_url: string | null; _id: string };
    const scaleList: RecItem[] = [];
    const killList: RecItem[] = [];

    const resolveImage = async (c: typeof creatives[0]) => {
      if (c.image_storage_id) {
        const url = await ctx.storage.getUrl(c.image_storage_id);
        if (url) return url;
      }
      return c.thumbnail_url || null;
    };

    for (const c of creatives) {
      if (c.spend < spendThreshold) continue;

      const imageUrl = await resolveImage(c);

      if (goal === "lead_gen") {
        if (c.cpa > 0 && c.cpa <= cpaThreshold && c.ctr >= medianCtr) {
          scaleList.push({ _id: c._id, ad_name: c.ad_name || "Untitled", spend: c.spend, primary_metric: `CPA: $${c.cpa.toFixed(2)}`, rationale: `CPA beats target. CTR ${c.ctr.toFixed(2)}% above median.`, image_url: imageUrl });
        } else if (c.cpa === 0 && c.spend > spendThreshold * 3) {
          killList.push({ _id: c._id, ad_name: c.ad_name || "Untitled", spend: c.spend, primary_metric: "No conversions", rationale: `$${c.spend.toFixed(0)} spent with zero results.`, image_url: imageUrl });
        } else if (c.cpa > cpaThreshold * 1.5) {
          killList.push({ _id: c._id, ad_name: c.ad_name || "Untitled", spend: c.spend, primary_metric: `CPA: $${c.cpa.toFixed(2)}`, rationale: `CPA 50%+ above target. Inefficient spend.`, image_url: imageUrl });
        }
      } else if (goal === "traffic") {
        if (c.ctr >= medianCtr * 1.3) {
          scaleList.push({ _id: c._id, ad_name: c.ad_name || "Untitled", spend: c.spend, primary_metric: `CTR: ${c.ctr.toFixed(2)}%`, rationale: `CTR well above median (${medianCtr.toFixed(2)}%).`, image_url: imageUrl });
        } else if (c.ctr < medianCtr * 0.5) {
          killList.push({ _id: c._id, ad_name: c.ad_name || "Untitled", spend: c.spend, primary_metric: `CTR: ${c.ctr.toFixed(2)}%`, rationale: `CTR far below median. Low engagement.`, image_url: imageUrl });
        }
      } else {
        if (c.roas >= roasThreshold && c.ctr >= medianCtr) {
          scaleList.push({ _id: c._id, ad_name: c.ad_name || "Untitled", spend: c.spend, primary_metric: `ROAS: ${c.roas.toFixed(2)}x`, rationale: `ROAS meets ${roasThreshold}x target. CTR above median.`, image_url: imageUrl });
        } else if (c.roas < roasThreshold * 0.5) {
          killList.push({ _id: c._id, ad_name: c.ad_name || "Untitled", spend: c.spend, primary_metric: `ROAS: ${c.roas.toFixed(2)}x`, rationale: `ROAS below 50% of target. Poor returns.`, image_url: imageUrl });
        }
      }
    }

    // Sort: scale by best metric, kill by most spend
    scaleList.sort((a, b) => b.spend - a.spend);
    killList.sort((a, b) => b.spend - a.spend);
    const totalWastedSpend = Math.round(killList.reduce((s, c) => s + c.spend, 0) * 100) / 100;

    // Iteration priorities (simplified from analytics.ts)
    const qualifiedAnalyzed = analyzedCreatives.filter((c) => c.spend >= spendThreshold);
    const iterationPriorities: Array<{ type: string; title: string; suggestion: string }> = [];

    // Group by angle + format for expansion suggestions
    const anglePerf: Record<string, typeof qualifiedAnalyzed> = {};
    const formatPerf: Record<string, typeof qualifiedAnalyzed> = {};
    for (const c of qualifiedAnalyzed) {
      if (c.messaging_angle) {
        if (!anglePerf[c.messaging_angle]) anglePerf[c.messaging_angle] = [];
        anglePerf[c.messaging_angle].push(c);
      }
      if (c.visual_format) {
        if (!formatPerf[c.visual_format]) formatPerf[c.visual_format] = [];
        formatPerf[c.visual_format].push(c);
      }
    }

    function isGoodMetric(items: typeof qualifiedAnalyzed): boolean {
      if (goal === "lead_gen") {
        const withCpa = items.filter((c) => c.cpa > 0);
        if (withCpa.length === 0) return false;
        const avg = withCpa.reduce((s, c) => s + c.cpa, 0) / withCpa.length;
        return avg <= cpaThreshold * 1.5;
      }
      if (goal === "traffic") {
        return items.reduce((s, c) => s + c.ctr, 0) / items.length > 2.0;
      }
      return items.reduce((s, c) => s + c.roas, 0) / items.length > 1.5;
    }

    // Angle expansion priorities
    for (const [angle, items] of Object.entries(anglePerf)) {
      if (!isGoodMetric(items)) continue;
      const formats = [...new Set(items.map((c) => c.visual_format).filter(Boolean))];
      const allFormats = Object.keys(formatPerf);
      const untested = allFormats.filter((f) => !formats.includes(f));
      if (untested.length > 0) {
        iterationPriorities.push({
          type: "angle_expansion",
          title: `Test "${angle}" in new formats`,
          suggestion: `Try "${angle}" messaging as ${untested.slice(0, 2).join(" or ")}`,
        });
      }
    }

    // Hook variation priorities
    for (const [format, items] of Object.entries(formatPerf)) {
      if (!isGoodMetric(items)) continue;
      const hooks = [...new Set(items.map((c) => c.hook_tactic).filter(Boolean))];
      const allHooks = ["Question", "Bold Claim", "Statistic", "Story", "Problem Statement", "Curiosity Gap"];
      const untested = allHooks.filter((h) => !hooks.includes(h));
      if (untested.length > 0) {
        iterationPriorities.push({
          type: "hook_variation",
          title: `New hooks for "${format}"`,
          suggestion: `Try a "${untested[0]}" hook with ${format} format`,
        });
      }
    }

    // High-spend underperformer optimization
    for (const c of qualifiedAnalyzed) {
      const isUnder = goal === "lead_gen"
        ? (c.cpa === 0 || c.cpa > cpaThreshold) && c.spend > spendThreshold * 3
        : goal === "traffic"
        ? c.ctr < 2.0 && c.spend > spendThreshold * 3
        : c.roas > 0 && c.roas < 1.5 && c.spend > spendThreshold * 3;
      if (isUnder) {
        iterationPriorities.push({
          type: "optimization",
          title: `Optimize "${(c.ad_name || "Untitled").slice(0, 30)}"`,
          suggestion: c.hook_tactic ? `Try a different hook (currently "${c.hook_tactic}")` : "Test a stronger hook or offer",
        });
      }
    }

    const recommendations = {
      scale: scaleList.slice(0, 5),
      kill: killList.slice(0, 5),
      total_wasted_spend: totalWastedSpend,
      iteration_priorities: iterationPriorities.slice(0, 5),
    };

    // ── Sort by goal metric (for top/bottom performers) ──
    const qualified = creatives.filter((c) => c.spend >= spendThreshold);
    let sorted: typeof qualified;

    if (goal === "lead_gen") {
      sorted = [...qualified].sort((a, b) => {
        if (a.cpa === 0 && b.cpa === 0) return b.spend - a.spend;
        if (a.cpa === 0) return 1;
        if (b.cpa === 0) return -1;
        return a.cpa - b.cpa;
      });
    } else if (goal === "traffic") {
      sorted = [...qualified].sort((a, b) => b.ctr - a.ctr);
    } else {
      sorted = [...qualified].sort((a, b) => b.roas - a.roas);
    }

    const mapPerformer = async (c: typeof creatives[0]) => {
      let image_url = c.thumbnail_url || null;
      if (c.image_storage_id) {
        const url = await ctx.storage.getUrl(c.image_storage_id);
        if (url) image_url = url;
      }
      return {
        _id: c._id,
        ad_name: c.ad_name,
        ad_type: c.ad_type,
        roas: c.roas,
        spend: c.spend,
        ctr: c.ctr,
        cpa: c.cpa,
        cpc: c.cpc,
        impressions: c.impressions,
        purchases: c.purchases,
        leads: c.leads,
        conversions: c.conversions,
        clicks: c.clicks,
        purchase_value: c.purchase_value,
        funnel_stage: c.funnel_stage,
        asset_type: c.asset_type,
        visual_format: c.visual_format,
        messaging_angle: c.messaging_angle,
        hook_tactic: c.hook_tactic,
        summary: c.summary,
        image_url,
      };
    };

    const topPerformers = await Promise.all(sorted.slice(0, 5).map(mapPerformer));
    const bottomPerformers = await Promise.all(sorted.slice(-5).reverse().map(mapPerformer));

    // Date window
    const dates = creatives.map((c) => c.date_start).filter(Boolean).sort() as string[];
    const windowStart = dates[0] || undefined;
    const windowEnd = dates[dates.length - 1] || undefined;

    // Previous report comparison
    const allReports = await ctx.db
      .query("reports")
      .withIndex("by_account_id", (q) => q.eq("account_id", account_id || undefined))
      .order("desc")
      .collect();
    const previousReport = allReports.length > 0 ? allReports[0] : null;

    let comparisonData: {
      spend_delta: number; spend_pct: number | null;
      roas_delta: number; ctr_delta: number;
      cpa_delta: number; creative_delta: number;
    } | null = null;
    if (previousReport) {
      comparisonData = {
        spend_delta: totalSpend - previousReport.total_spend,
        spend_pct: previousReport.total_spend > 0
          ? ((totalSpend - previousReport.total_spend) / previousReport.total_spend * 100)
          : null,
        roas_delta: avgRoas - previousReport.avg_roas,
        ctr_delta: avgCtr - previousReport.avg_ctr,
        cpa_delta: avgCpa - previousReport.avg_cpa,
        creative_delta: creatives.length - previousReport.creative_count,
      };
    }

    const reportId = await ctx.db.insert("reports", {
      account_id: account_id || undefined,
      campaign_goal: goal,
      total_spend: Math.round(totalSpend * 100) / 100,
      total_impressions: totalImpressions,
      avg_roas: Math.round(avgRoas * 100) / 100,
      avg_ctr: Math.round(avgCtr * 100) / 100,
      avg_cpa: Math.round(avgCpa * 100) / 100,
      creative_count: creatives.length,
      top_performers: JSON.stringify(topPerformers),
      bottom_performers: JSON.stringify(bottomPerformers),
      window_start: windowStart,
      window_end: windowEnd,
      window_days: windowDays,
      previous_report_id: previousReport?._id || undefined,
      comparison_data: comparisonData ? JSON.stringify(comparisonData) : undefined,
      funnel_breakdown: JSON.stringify(funnelBreakdown),
      creative_mix: JSON.stringify(creativeMix),
      recommendations: JSON.stringify(recommendations),
      detailed_metrics: JSON.stringify(detailedMetrics),
    });

    return reportId;
  },
});
