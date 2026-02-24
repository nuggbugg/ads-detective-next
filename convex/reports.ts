import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const reports = await ctx.db.query("reports").order("desc").collect();
    return reports.map((r) => ({
      ...r,
      top_performers: JSON.parse(r.top_performers || "[]"),
      bottom_performers: JSON.parse(r.bottom_performers || "[]"),
      comparison_data: r.comparison_data ? JSON.parse(r.comparison_data) : null,
    }));
  },
});

export const getById = query({
  args: { id: v.id("reports") },
  handler: async (ctx, { id }) => {
    const r = await ctx.db.get(id);
    if (!r) return null;
    return {
      ...r,
      top_performers: JSON.parse(r.top_performers || "[]"),
      bottom_performers: JSON.parse(r.bottom_performers || "[]"),
      comparison_data: r.comparison_data ? JSON.parse(r.comparison_data) : null,
    };
  },
});

export const generate = mutation({
  args: {
    account_id: v.optional(v.string()),
  },
  handler: async (ctx, { account_id }) => {
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

    // Aggregate metrics
    const totalSpend = creatives.reduce((s, c) => s + c.spend, 0);
    const totalImpressions = creatives.reduce((s, c) => s + c.impressions, 0);
    const totalPurchaseValue = creatives.reduce((s, c) => s + c.purchase_value, 0);
    const avgRoas = totalSpend > 0 ? totalPurchaseValue / totalSpend : 0;
    const avgCtr = creatives.length > 0 ? creatives.reduce((s, c) => s + c.ctr, 0) / creatives.length : 0;
    const totalConversions = creatives.reduce((s, c) => s + c.conversions, 0);
    const avgCpa = totalConversions > 0 ? totalSpend / totalConversions : 0;

    // Get settings
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

    // Sort by goal metric
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
        purchases: c.purchases,
        leads: c.leads,
        conversions: c.conversions,
        clicks: c.clicks,
        funnel_stage: c.funnel_stage,
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
    });

    return reportId;
  },
});
