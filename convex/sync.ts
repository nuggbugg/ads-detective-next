import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import {
  fetchAdsWithInsights,
  fetchAds,
  fetchFullResImageBlobs,
  normalizeInsight,
} from "./meta";

// Helper: trigger auto-analysis of pending creatives after sync
async function autoAnalyze(
  ctx: { runAction: (ref: unknown, args: unknown) => Promise<unknown> },
  label: string
) {
  try {
    const result = await ctx.runAction(internal.analysis._analyzeUnanalyzedImpl, { limit: 50 });
    const r = result as { analyzed: number; errors: number };
    if (r.analyzed > 0) {
      console.log(`[auto-analyze] ${label}: analyzed ${r.analyzed}, errors ${r.errors}`);
    }
  } catch (err) {
    console.error(`[auto-analyze] ${label} failed:`, err);
    // Non-fatal: sync still succeeded
  }
}

// Internal implementation of syncAccount
export const _syncAccountImpl = internalAction({
  args: {
    account_id: v.id("ad_accounts"),
  },
  handler: async (ctx, { account_id }): Promise<{ synced: number; account: string }> => {
    // Get account
    const account = await ctx.runQuery(api.accounts.getById, { id: account_id });
    if (!account) throw new Error("Account not found");

    // Get token
    const token = await ctx.runQuery(internal.settings.get, { key: "meta_access_token" });
    if (!token) throw new Error("Meta access token not configured");

    // Get date range
    const dateRangeDays = await ctx.runQuery(internal.settings.get, { key: "date_range_days" });
    const days = parseInt(dateRangeDays || "30");

    const until = new Date().toISOString().split("T")[0];
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);
    const since = sinceDate.toISOString().split("T")[0];

    // Fetch insights + ads in parallel
    const [insights, ads] = await Promise.all([
      fetchAdsWithInsights(token, account.meta_account_id, since, until),
      fetchAds(token, account.meta_account_id),
    ]);

    // Build ads map
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adsMap = new Map<string, any>();
    for (const ad of ads as Array<Record<string, unknown>>) {
      adsMap.set(ad.id as string, ad);
    }

    // Normalize and upsert
    let synced = 0;
    for (const insight of insights as Array<Record<string, unknown>>) {
      const normalized = normalizeInsight(insight, adsMap);

      await ctx.runMutation(api.creatives.upsert, {
        ad_id: normalized.ad_id,
        data: {
          account_id: account.meta_account_id,
          ad_name: normalized.ad_name,
          ad_status: normalized.ad_status,
          campaign_name: normalized.campaign_name,
          campaign_objective: normalized.campaign_objective,
          adset_name: normalized.adset_name,
          ad_type: normalized.ad_type,
          thumbnail_url: normalized.thumbnail_url,
          spend: normalized.spend,
          impressions: normalized.impressions,
          clicks: normalized.clicks,
          ctr: normalized.ctr,
          cpc: normalized.cpc,
          cpm: normalized.cpm,
          purchases: normalized.purchases,
          leads: normalized.leads,
          conversions: normalized.conversions,
          purchase_value: normalized.purchase_value,
          roas: normalized.roas,
          cpa: normalized.cpa,
          video_p25: normalized.video_p25,
          video_p50: normalized.video_p50,
          video_p75: normalized.video_p75,
          video_p100: normalized.video_p100,
          video_thruplay: normalized.video_thruplay,
          date_start: normalized.date_start,
          date_stop: normalized.date_stop,
        },
      });
      synced++;
    }

    // Download full-res images and store in Convex
    try {
      const imageBlobs = await fetchFullResImageBlobs(
        token,
        account.meta_account_id,
        ads as Array<Record<string, unknown>>
      );

      for (const [adId, blob] of imageBlobs) {
        const storageId = await ctx.storage.store(blob);
        // Use upsert to patch with image_storage_id
        await ctx.runMutation(api.creatives.upsert, {
          ad_id: adId,
          data: { image_storage_id: storageId },
        });
      }
    } catch (err) {
      console.error("Image download failed:", err);
      // Non-fatal: sync still succeeds without images
    }

    // Update last_synced_at
    await ctx.runMutation(api.accounts.update, {
      id: account_id,
      last_synced_at: new Date().toISOString(),
    });

    // Auto-analyze pending creatives
    await autoAnalyze(ctx as never, account.name);

    return { synced, account: account.name };
  },
});

// Public wrapper for syncAccount (called from frontend)
export const syncAccount = action({
  args: {
    account_id: v.id("ad_accounts"),
  },
  handler: async (ctx, { account_id }): Promise<{ synced: number; account: string }> => {
    return await ctx.runAction(internal.sync._syncAccountImpl, { account_id });
  },
});

// Internal syncAll (used by cron job)
export const _syncAllImpl = internalAction({
  args: {},
  handler: async (ctx) => {
    const accounts = await ctx.runQuery(api.accounts.list, {});
    const activeAccounts = accounts.filter((a: { is_active: boolean }) => a.is_active);

    if (activeAccounts.length === 0) {
      console.log("[cron] No active accounts to sync");
      return { results: [] };
    }

    const results: Array<{ synced: number; account: string; error?: string }> = [];
    for (const account of activeAccounts) {
      try {
        const result = await ctx.runAction(internal.sync._syncAccountImpl, { account_id: account._id });
        results.push(result);
      } catch (err) {
        results.push({
          account: account.name,
          synced: 0,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    const totalSynced = results.reduce((s, r) => s + r.synced, 0);
    const totalErrors = results.filter(r => r.error).length;
    console.log(`[cron] Sync complete: ${totalSynced} creatives across ${results.length} accounts, ${totalErrors} errors`);

    return { results };
  },
});

// Public wrapper for syncAll (called from frontend)
export const syncAll = action({
  args: {},
  handler: async (ctx): Promise<{ results: Array<{ synced: number; account: string; error?: string }> }> => {
    return await ctx.runAction(internal.sync._syncAllImpl, {}) as { results: Array<{ synced: number; account: string; error?: string }> };
  },
});
