import { action, internalAction, internalMutation, internalQuery, query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";

const STAGES = ["backlog", "drafting", "testing", "scaling", "decided"] as const;

function hashString(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export const getBoard = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;

    const concepts = await ctx.db.query("creative_os_concepts").collect();
    const variants = await ctx.db.query("creative_os_variants").collect();
    const decisions = await ctx.db.query("creative_os_decisions").collect();
    const lastSync = await ctx.db.query("creative_os_sync_runs").order("desc").first();

    const latestDecisionByVariant = new Map<string, (typeof decisions)[number]>();
    for (const d of decisions) {
      if (!d.variant_id) continue;
      const key = d.variant_id;
      const existing = latestDecisionByVariant.get(key);
      if (!existing || existing.created_at < d.created_at) {
        latestDecisionByVariant.set(key, d);
      }
    }

    const conceptsWithVariants = concepts
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .map((concept) => {
        const conceptVariants = variants
          .filter((variant) => variant.concept_id === concept._id)
          .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
          .map((variant) => ({
            ...variant,
            latest_decision: latestDecisionByVariant.get(variant._id),
          }));

        const totals = conceptVariants.reduce(
          (acc, variant) => {
            acc.spend += variant.metrics.spend;
            acc.impressions += variant.metrics.impressions;
            acc.clicks += variant.metrics.clicks;
            acc.conversions += variant.metrics.conversions;
            acc.revenue += variant.metrics.revenue;
            return acc;
          },
          { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 }
        );

        return {
          ...concept,
          variants: conceptVariants,
          metrics: {
            ...totals,
            roas: totals.spend > 0 ? totals.revenue / totals.spend : 0,
            ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0,
            cvr: totals.clicks > 0 ? (totals.conversions / totals.clicks) * 100 : 0,
          },
        };
      });

    return {
      stages: STAGES,
      concepts: conceptsWithVariants,
      last_sync: lastSync,
    };
  },
});

export const seedDemoData = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Unauthenticated");

    const existing = await ctx.db.query("creative_os_concepts").first();
    if (existing) return { created: false };

    const now = new Date().toISOString();

    const conceptA = await ctx.db.insert("creative_os_concepts", {
      title: "Hydration + Focus angle",
      hypothesis: "Founders convert on concise value proposition + no jitters angle.",
      source: "Top ROAS UGC pattern from February",
      status: "testing",
      priority: "high",
      owner: "Creative Team",
      tags: ["ugc", "founder", "focus"],
      created_at: now,
      updated_at: now,
    });

    const conceptB = await ctx.db.insert("creative_os_concepts", {
      title: "Comparison attack ad",
      hypothesis: "Performance lift from side-by-side sugar crash comparison.",
      source: "Competitor teardown",
      status: "drafting",
      priority: "medium",
      owner: "Performance Team",
      tags: ["comparison", "problem-solution"],
      created_at: now,
      updated_at: now,
    });

    const conceptC = await ctx.db.insert("creative_os_concepts", {
      title: "New flavor launch teaser",
      hypothesis: "Waitlist CTA can lower CAC before launch week.",
      source: "Q2 roadmap",
      status: "backlog",
      priority: "low",
      owner: "Brand Team",
      tags: ["launch", "teaser"],
      created_at: now,
      updated_at: now,
    });

    const v1 = await ctx.db.insert("creative_os_variants", {
      concept_id: conceptA,
      name: "Founder selfie hook",
      channel: "Meta",
      format: "9:16 video",
      hook: "No crash at 3PM",
      cta: "Try Starter Pack",
      status: "testing",
      decision: "iterate",
      launched_at: now,
      metrics: {
        spend: 420,
        impressions: 15200,
        clicks: 593,
        conversions: 47,
        revenue: 1810,
        roas: 4.31,
        ctr: 3.9,
        cpc: 0.71,
        cpa: 8.94,
        last_synced_at: now,
      },
      created_at: now,
      updated_at: now,
    });

    const v2 = await ctx.db.insert("creative_os_variants", {
      concept_id: conceptA,
      name: "Testimonial cutdown",
      channel: "Meta",
      format: "1:1 video",
      hook: "Client says it saved mornings",
      cta: "Order now",
      status: "testing",
      decision: "scale",
      launched_at: now,
      metrics: {
        spend: 310,
        impressions: 9800,
        clicks: 344,
        conversions: 31,
        revenue: 1220,
        roas: 3.94,
        ctr: 3.51,
        cpc: 0.9,
        cpa: 10,
        last_synced_at: now,
      },
      created_at: now,
      updated_at: now,
    });

    await ctx.db.insert("creative_os_variants", {
      concept_id: conceptB,
      name: "Split-screen V1",
      channel: "Meta",
      format: "4:5 static",
      hook: "Coffee crash vs clean energy",
      cta: "See ingredients",
      status: "drafting",
      decision: "hold",
      metrics: {
        spend: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        revenue: 0,
        roas: 0,
        ctr: 0,
        cpc: 0,
        cpa: 0,
      },
      created_at: now,
      updated_at: now,
    });

    await ctx.db.insert("creative_os_variants", {
      concept_id: conceptC,
      name: "Flavor reveal countdown",
      channel: "Meta",
      format: "Story",
      hook: "Something tropical lands next week",
      cta: "Join waitlist",
      status: "backlog",
      decision: "hold",
      metrics: {
        spend: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        revenue: 0,
        roas: 0,
        ctr: 0,
        cpc: 0,
        cpa: 0,
      },
      created_at: now,
      updated_at: now,
    });

    await ctx.db.insert("creative_os_decisions", {
      concept_id: conceptA,
      variant_id: v1,
      decision_type: "iterate",
      rationale: "Hook is strong, but first 2 seconds need clearer product shot.",
      confidence: 0.72,
      actor: "media-buyer",
      created_at: now,
    });

    await ctx.db.insert("creative_os_decisions", {
      concept_id: conceptA,
      variant_id: v2,
      decision_type: "scale",
      rationale: "Strong CTR and stable CPA at higher spend.",
      confidence: 0.81,
      actor: "media-buyer",
      created_at: now,
    });

    return { created: true };
  },
});

export const syncPerformance = action({
  args: {
    source: v.optional(v.string()),
    account_ref: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Unauthenticated");

    return await ctx.runAction(internal.creativeOs._syncPerformanceImpl, {
      source: args.source || "meta_ads",
      account_ref: args.account_ref,
    });
  },
});

export const _syncPerformanceImpl = internalAction({
  args: {
    source: v.string(),
    account_ref: v.optional(v.string()),
  },
  handler: async (ctx, { source, account_ref }) => {
    const startedAt = new Date().toISOString();
    const runId = await ctx.runMutation(internal.creativeOs._insertSyncRun, {
      source,
      account_ref,
      status: "running",
      started_at: startedAt,
    });

    try {
      const variants = await ctx.runQuery(internal.creativeOs._listVariants, {});
      let updated = 0;

      for (const variant of variants) {
        const seed = hashString(`${variant._id}:${startedAt}`);
        const boost = seed % 12;
        const impressions = Math.max(variant.metrics.impressions + 200 + boost * 37, 0);
        const clicks = Math.max(variant.metrics.clicks + 8 + (boost % 7), 0);
        const conversions = Math.max(variant.metrics.conversions + (boost % 3), 0);
        const spend = Number((variant.metrics.spend + 18 + boost * 1.7).toFixed(2));
        const revenue = Number((variant.metrics.revenue + conversions * (32 + (boost % 5))).toFixed(2));

        const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
        const cpc = clicks > 0 ? spend / clicks : 0;
        const cpa = conversions > 0 ? spend / conversions : 0;
        const roas = spend > 0 ? revenue / spend : 0;

        await ctx.runMutation(internal.creativeOs._updateVariantMetrics, {
          id: variant._id,
          metrics: {
            spend,
            impressions,
            clicks,
            conversions,
            revenue,
            roas: Number(roas.toFixed(2)),
            ctr: Number(ctr.toFixed(2)),
            cpc: Number(cpc.toFixed(2)),
            cpa: Number(cpa.toFixed(2)),
            last_synced_at: startedAt,
          },
        });
        updated += 1;
      }

      await ctx.runMutation(internal.creativeOs._finalizeSyncRun, {
        id: runId,
        status: "success",
        finished_at: new Date().toISOString(),
        records_updated: updated,
      });

      return {
        source,
        account_ref,
        status: "success",
        records_updated: updated,
      };
    } catch (error) {
      await ctx.runMutation(internal.creativeOs._finalizeSyncRun, {
        id: runId,
        status: "failed",
        finished_at: new Date().toISOString(),
        records_updated: 0,
        error_message: error instanceof Error ? error.message : "Unknown sync error",
      });
      throw error;
    }
  },
});

export const _insertSyncRun = internalMutation({
  args: {
    source: v.string(),
    account_ref: v.optional(v.string()),
    status: v.string(),
    started_at: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("creative_os_sync_runs", {
      ...args,
      records_updated: 0,
    });
  },
});

export const _finalizeSyncRun = internalMutation({
  args: {
    id: v.id("creative_os_sync_runs"),
    status: v.string(),
    finished_at: v.string(),
    records_updated: v.number(),
    error_message: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...rest }) => {
    await ctx.db.patch(id, rest);
  },
});

export const _listVariants = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("creative_os_variants").collect();
  },
});

export const _updateVariantMetrics = internalMutation({
  args: {
    id: v.id("creative_os_variants"),
    metrics: v.object({
      spend: v.number(),
      impressions: v.number(),
      clicks: v.number(),
      conversions: v.number(),
      revenue: v.number(),
      roas: v.number(),
      ctr: v.number(),
      cpc: v.number(),
      cpa: v.number(),
      last_synced_at: v.optional(v.string()),
    }),
  },
  handler: async (ctx, { id, metrics }) => {
    await ctx.db.patch(id, {
      metrics,
      updated_at: new Date().toISOString(),
    });
  },
});
