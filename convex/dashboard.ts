import { query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export const get = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const allCreatives = await ctx.db.query("creatives").collect();
    const allAccounts = await ctx.db.query("ad_accounts").collect();

    // Get campaign goal from settings
    const goalSetting = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "campaign_goal"))
      .first();
    const goal = goalSetting?.value || "roas";

    // Filter creatives by campaign objective based on goal setting
    // Map goal → Meta objective substring
    const objectiveFilter =
      goal === "lead_gen" ? "LEAD"
      : goal === "traffic" ? "TRAFFIC"
      : "SALES"; // "roas" → OUTCOME_SALES

    const goalCreatives = allCreatives.filter((c) =>
      (c.campaign_objective || "").toUpperCase().includes(objectiveFilter)
    );

    // Aggregate metrics — filtered by goal objective
    const withDelivery = goalCreatives.filter((c) => c.spend > 0);
    const withConversions = withDelivery.filter((c) => c.conversions > 0);

    const metrics = {
      // Summary bar counts are unfiltered (all creatives)
      total_creatives: allCreatives.length,
      active_ads: allCreatives.filter((c) => c.ad_status === "ACTIVE").length,
      analyzed_count: allCreatives.filter((c) => c.analysis_status === "completed").length,
      pending_count: allCreatives.filter((c) => c.analysis_status === "pending").length,
      // Performance metrics are filtered by goal objective
      filtered_creatives: goalCreatives.length,
      filtered_active: goalCreatives.filter((c) => c.ad_status === "ACTIVE").length,
      with_delivery: withDelivery.length,
      total_spend: goalCreatives.reduce((s, c) => s + c.spend, 0),
      avg_roas: withDelivery.length > 0 ? withDelivery.reduce((s, c) => s + c.roas, 0) / withDelivery.length : 0,
      avg_ctr: withDelivery.length > 0 ? withDelivery.reduce((s, c) => s + c.ctr, 0) / withDelivery.length : 0,
      avg_cpa: withConversions.length > 0 ? withConversions.reduce((s, c) => s + c.cpa, 0) / withConversions.length : 0,
      total_impressions: goalCreatives.reduce((s, c) => s + c.impressions, 0),
      total_clicks: goalCreatives.reduce((s, c) => s + c.clicks, 0),
      total_purchases: goalCreatives.reduce((s, c) => s + c.purchases, 0),
      total_leads: goalCreatives.reduce((s, c) => s + c.leads, 0),
      total_conversions: goalCreatives.reduce((s, c) => s + c.conversions, 0),
    };

    // Read spend threshold from settings
    const spendSetting = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "iteration_spend_threshold"))
      .first();
    const spendThreshold = parseFloat(spendSetting?.value ?? "") || 50;

    // Top performers — filtered by goal objective
    const qualified = goalCreatives.filter((c) => c.spend > spendThreshold);
    let topPerformers;
    if (goal === "lead_gen") {
      topPerformers = qualified
        .filter((c) => c.conversions > 0)
        .sort((a, b) => a.cpa - b.cpa)
        .slice(0, 5);
    } else if (goal === "traffic") {
      topPerformers = qualified
        .filter((c) => c.ctr > 0)
        .sort((a, b) => b.ctr - a.ctr)
        .slice(0, 5);
    } else {
      topPerformers = qualified
        .filter((c) => c.roas > 0)
        .sort((a, b) => b.roas - a.roas)
        .slice(0, 5);
    }

    // Resolve image URLs from Convex storage
    const topPerformersWithImages = await Promise.all(
      topPerformers.map(async (p) => {
        let resolvedImageUrl = p.image_url || p.thumbnail_url || null;
        if (p.image_storage_id) {
          const url = await ctx.storage.getUrl(p.image_storage_id);
          if (url) resolvedImageUrl = url;
        }
        return {
          _id: p._id,
          ad_name: p.ad_name,
          roas: p.roas,
          spend: p.spend,
          ctr: p.ctr,
          cpa: p.cpa,
          purchases: p.purchases,
          leads: p.leads,
          conversions: p.conversions,
          ad_type: p.ad_type,
          image_url: resolvedImageUrl,
        };
      })
    );

    const activeAccounts = allAccounts.filter((a) => a.is_active);

    // Shopify sales goal
    const shopifyToken = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "shopify_access_token"))
      .first();
    let salesGoal: { sold: number; b2b: number; online: number; b2b_revenue: number; online_revenue: number; total_revenue: number; goal: number; month: string; last_fetched: string } | null = null;
    if (shopifyToken?.value) {
      const cached = await ctx.db
        .query("settings")
        .withIndex("by_key", (q) => q.eq("key", "shopify_sales"))
        .first();
      if (cached) {
        try {
          salesGoal = JSON.parse(cached.value);
        } catch {
          // ignore
        }
      }
    }

    return {
      metrics,
      accounts: {
        total: allAccounts.length,
        active: activeAccounts.length,
        list: allAccounts.map((a) => ({
          _id: a._id,
          name: a.name,
          is_active: a.is_active,
          last_synced_at: a.last_synced_at,
        })),
      },
      top_performers: topPerformersWithImages,
      campaign_goal: goal,
      sales_goal: salesGoal,
      has_shopify: !!shopifyToken?.value,
    };
  },
});
