import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { analyzeCreative } from "./gemini";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnalysisResult = any;

// Internal implementation of analyzeOne
export const _analyzeOneImpl = internalAction({
  args: {
    id: v.id("creatives"),
  },
  handler: async (ctx, { id }): Promise<AnalysisResult> => {
    // Get Gemini key
    const apiKey = await ctx.runQuery(internal.settings.get, { key: "gemini_api_key" });
    if (!apiKey) throw new Error("Gemini API key not configured");

    // Get creative (includes resolved_image_url from storage)
    const creative = await ctx.runQuery(api.creatives.getById, { id });
    if (!creative) throw new Error("Creative not found");

    // Use stored image URL for visual analysis, fallback to thumbnail
    const imageUrl = creative.resolved_image_url || creative.thumbnail_url || null;

    // Run analysis (with image if available)
    const result = await analyzeCreative(apiKey, {
      ad_name: creative.ad_name,
      campaign_name: creative.campaign_name,
      campaign_objective: creative.campaign_objective,
      adset_name: creative.adset_name,
      ad_type: creative.ad_type,
      spend: creative.spend,
      roas: creative.roas,
      ctr: creative.ctr,
      cpa: creative.cpa,
      impressions: creative.impressions,
      clicks: creative.clicks,
      imageUrl,
    });

    // Update creative with analysis
    await ctx.runMutation(api.creatives.updateAnalysis, {
      id,
      data: {
        asset_type: result.asset_type,
        visual_format: result.visual_format,
        messaging_angle: result.messaging_angle,
        hook_tactic: result.hook_tactic,
        offer_type: result.offer_type,
        funnel_stage: result.funnel_stage,
        summary: result.summary,
        analysis_status: "completed",
        analyzed_at: new Date().toISOString(),
      },
    });

    return result;
  },
});

// Public wrapper for analyzeOne (called from frontend)
export const analyzeOne = action({
  args: {
    id: v.id("creatives"),
  },
  handler: async (ctx, { id }): Promise<AnalysisResult> => {
    return await ctx.runAction(internal.analysis._analyzeOneImpl, { id });
  },
});

// Internal implementation (called by sync auto-analyze and cron)
export const _analyzeUnanalyzedImpl = internalAction({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit }): Promise<{ analyzed: number; errors: number; total: number }> => {
    const apiKey = await ctx.runQuery(internal.settings.get, { key: "gemini_api_key" });
    if (!apiKey) return { analyzed: 0, errors: 0, total: 0 };

    // Get pending creatives directly via index
    const pending = await ctx.runQuery(internal.creatives.listByAnalysisStatus, {
      status: "pending",
      limit: limit || 50,
    });

    if (pending.length === 0) return { analyzed: 0, errors: 0, total: 0 };

    let analyzed = 0;
    let errors = 0;

    for (const creative of pending) {
      try {
        await ctx.runAction(internal.analysis._analyzeOneImpl, { id: creative._id as never });
        analyzed++;
      } catch (err) {
        console.error(`Analysis failed for ${creative._id}:`, err);
        errors++;
      }
    }

    return { analyzed, errors, total: pending.length };
  },
});

// Public wrapper for analyzeUnanalyzed (called from frontend)
export const analyzeUnanalyzed = action({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit }): Promise<{ analyzed: number; errors: number; total: number }> => {
    return await ctx.runAction(internal.analysis._analyzeUnanalyzedImpl, { limit }) as { analyzed: number; errors: number; total: number };
  },
});
