import { query } from "./_generated/server";

export const get = query({
  args: {},
  handler: async (ctx) => {
    const allCreatives = await ctx.db.query("creatives").collect();
    const allAccounts = await ctx.db.query("ad_accounts").collect();

    // Get campaign goal from settings
    const goalSetting = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "campaign_goal"))
      .first();
    const goal = goalSetting?.value || "roas";

    // Aggregate metrics
    const withDelivery = allCreatives.filter((c) => c.spend > 0);
    const withConversions = withDelivery.filter((c) => c.conversions > 0);

    const metrics = {
      total_creatives: allCreatives.length,
      with_delivery: withDelivery.length,
      active_ads: allCreatives.filter((c) => c.ad_status === "ACTIVE").length,
      total_spend: allCreatives.reduce((s, c) => s + c.spend, 0),
      avg_roas: withDelivery.length > 0 ? withDelivery.reduce((s, c) => s + c.roas, 0) / withDelivery.length : 0,
      avg_ctr: withDelivery.length > 0 ? withDelivery.reduce((s, c) => s + c.ctr, 0) / withDelivery.length : 0,
      avg_cpa: withConversions.length > 0 ? withConversions.reduce((s, c) => s + c.cpa, 0) / withConversions.length : 0,
      total_impressions: allCreatives.reduce((s, c) => s + c.impressions, 0),
      total_clicks: allCreatives.reduce((s, c) => s + c.clicks, 0),
      total_purchases: allCreatives.reduce((s, c) => s + c.purchases, 0),
      total_leads: allCreatives.reduce((s, c) => s + c.leads, 0),
      total_conversions: allCreatives.reduce((s, c) => s + c.conversions, 0),
      analyzed_count: allCreatives.filter((c) => c.analysis_status === "completed").length,
      pending_count: allCreatives.filter((c) => c.analysis_status === "pending").length,
    };

    // Read spend threshold from settings
    const spendSetting = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "iteration_spend_threshold"))
      .first();
    const spendThreshold = parseFloat(spendSetting?.value ?? "") || 50;

    // Top performers — goal-aware
    const qualified = allCreatives.filter((c) => c.spend > spendThreshold);
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
    };
  },
});
