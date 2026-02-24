import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {
    account_id: v.optional(v.string()),
    ad_type: v.optional(v.string()),
    analysis_status: v.optional(v.string()),
    funnel_stage: v.optional(v.string()),
    asset_type: v.optional(v.string()),
    messaging_angle: v.optional(v.string()),
    delivery: v.optional(v.string()),
  },
  handler: async (ctx, filters) => {
    let creatives;
    if (filters.account_id) {
      creatives = await ctx.db
        .query("creatives")
        .withIndex("by_account_id", (q) => q.eq("account_id", filters.account_id!))
        .collect();
    } else {
      creatives = await ctx.db.query("creatives").collect();
    }

    // Apply JS-level filters
    if (filters.delivery === "had_delivery") {
      creatives = creatives.filter((c) => c.spend > 0);
    } else if (filters.delivery === "active") {
      creatives = creatives.filter((c) => c.ad_status === "ACTIVE");
    }
    if (filters.ad_type) {
      creatives = creatives.filter((c) => c.ad_type === filters.ad_type);
    }
    if (filters.analysis_status) {
      creatives = creatives.filter((c) => c.analysis_status === filters.analysis_status);
    }
    if (filters.funnel_stage) {
      creatives = creatives.filter((c) => c.funnel_stage === filters.funnel_stage);
    }
    if (filters.asset_type) {
      creatives = creatives.filter((c) => c.asset_type === filters.asset_type);
    }
    if (filters.messaging_angle) {
      creatives = creatives.filter((c) => c.messaging_angle === filters.messaging_angle);
    }

    // Sort by spend descending
    creatives.sort((a, b) => b.spend - a.spend);

    // Resolve image URLs
    return await Promise.all(
      creatives.map(async (c) => {
        let resolvedImageUrl = c.image_url || c.thumbnail_url || null;
        if (c.image_storage_id) {
          const url = await ctx.storage.getUrl(c.image_storage_id);
          if (url) resolvedImageUrl = url;
        }
        return { ...c, resolved_image_url: resolvedImageUrl };
      })
    );
  },
});

export const getFilterOptions = query({
  args: {},
  handler: async (ctx) => {
    const creatives = await ctx.db.query("creatives").collect();
    const unique = (field: keyof (typeof creatives)[0]) =>
      [...new Set(creatives.map((c) => c[field]).filter(Boolean))] as string[];

    return {
      ad_types: unique("ad_type"),
      asset_types: unique("asset_type"),
      visual_formats: unique("visual_format"),
      messaging_angles: unique("messaging_angle"),
      hook_tactics: unique("hook_tactic"),
      offer_types: unique("offer_type"),
      funnel_stages: unique("funnel_stage"),
      ad_statuses: unique("ad_status"),
      account_ids: unique("account_id"),
    };
  },
});

export const getById = query({
  args: { id: v.id("creatives") },
  handler: async (ctx, { id }) => {
    const creative = await ctx.db.get(id);
    if (!creative) return null;

    let resolvedImageUrl = creative.image_url || creative.thumbnail_url || null;
    if (creative.image_storage_id) {
      const url = await ctx.storage.getUrl(creative.image_storage_id);
      if (url) resolvedImageUrl = url;
    }
    return { ...creative, resolved_image_url: resolvedImageUrl };
  },
});

export const upsert = mutation({
  args: {
    ad_id: v.string(),
    data: v.any(),
  },
  handler: async (ctx, { ad_id, data }) => {
    const existing = await ctx.db
      .query("creatives")
      .withIndex("by_ad_id", (q) => q.eq("ad_id", ad_id))
      .first();

    const now = new Date().toISOString();
    if (existing) {
      await ctx.db.patch(existing._id, { ...data, updated_at: now });
      return existing._id;
    } else {
      return await ctx.db.insert("creatives", {
        ad_id,
        ...data,
        analysis_status: data.analysis_status || "pending",
        synced_at: now,
        updated_at: now,
      });
    }
  },
});

export const updateAnalysis = mutation({
  args: {
    id: v.id("creatives"),
    data: v.object({
      asset_type: v.optional(v.string()),
      visual_format: v.optional(v.string()),
      messaging_angle: v.optional(v.string()),
      hook_tactic: v.optional(v.string()),
      offer_type: v.optional(v.string()),
      funnel_stage: v.optional(v.string()),
      summary: v.optional(v.string()),
      analysis_status: v.string(),
      analyzed_at: v.optional(v.string()),
    }),
  },
  handler: async (ctx, { id, data }) => {
    await ctx.db.patch(id, { ...data, updated_at: new Date().toISOString() });
  },
});
