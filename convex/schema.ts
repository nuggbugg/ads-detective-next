import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,

  settings: defineTable({
    key: v.string(),
    value: v.string(),
  }).index("by_key", ["key"]),

  ad_accounts: defineTable({
    meta_account_id: v.string(),
    name: v.string(),
    currency: v.string(),
    is_active: v.boolean(),
    last_synced_at: v.optional(v.string()),
    updated_at: v.string(),
  })
    .index("by_meta_account_id", ["meta_account_id"])
    .index("by_active", ["is_active"]),

  creatives: defineTable({
    ad_id: v.string(),
    account_id: v.string(),
    ad_name: v.optional(v.string()),
    ad_status: v.optional(v.string()),
    campaign_name: v.optional(v.string()),
    campaign_objective: v.optional(v.string()),
    adset_name: v.optional(v.string()),
    ad_type: v.optional(v.string()),
    thumbnail_url: v.optional(v.string()),
    preview_url: v.optional(v.string()),
    image_storage_id: v.optional(v.id("_storage")),
    image_url: v.optional(v.string()),

    // Metrics
    spend: v.number(),
    impressions: v.number(),
    clicks: v.number(),
    ctr: v.number(),
    cpc: v.number(),
    cpm: v.number(),
    purchases: v.number(),
    leads: v.number(),
    conversions: v.number(),
    purchase_value: v.number(),
    roas: v.number(),
    cpa: v.number(),

    // Video metrics
    video_p25: v.number(),
    video_p50: v.number(),
    video_p75: v.number(),
    video_p100: v.number(),
    video_thruplay: v.number(),

    // AI Analysis
    asset_type: v.optional(v.string()),
    visual_format: v.optional(v.string()),
    messaging_angle: v.optional(v.string()),
    hook_tactic: v.optional(v.string()),
    offer_type: v.optional(v.string()),
    funnel_stage: v.optional(v.string()),
    summary: v.optional(v.string()),
    analysis_status: v.string(),
    analyzed_at: v.optional(v.string()),

    // Sync metadata
    date_start: v.optional(v.string()),
    date_stop: v.optional(v.string()),
    synced_at: v.string(),
    updated_at: v.string(),
  })
    .index("by_ad_id", ["ad_id"])
    .index("by_account_id", ["account_id"])
    .index("by_analysis_status", ["analysis_status"])
    .index("by_ad_status", ["ad_status"])
    .index("by_funnel_stage", ["funnel_stage"])
    .index("by_account_and_status", ["account_id", "analysis_status"]),

  creative_os_concepts: defineTable({
    title: v.string(),
    hypothesis: v.optional(v.string()),
    source: v.optional(v.string()),
    status: v.string(),
    priority: v.string(),
    owner: v.optional(v.string()),
    tags: v.array(v.string()),
    created_at: v.string(),
    updated_at: v.string(),
  })
    .index("by_status", ["status"])
    .index("by_priority", ["priority"])
    .index("by_updated_at", ["updated_at"]),

  creative_os_variants: defineTable({
    concept_id: v.id("creative_os_concepts"),
    name: v.string(),
    channel: v.optional(v.string()),
    format: v.optional(v.string()),
    hook: v.optional(v.string()),
    cta: v.optional(v.string()),
    status: v.string(),
    decision: v.string(),
    launched_at: v.optional(v.string()),
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
    created_at: v.string(),
    updated_at: v.string(),
  })
    .index("by_concept_id", ["concept_id"])
    .index("by_status", ["status"])
    .index("by_decision", ["decision"]),

  creative_os_decisions: defineTable({
    concept_id: v.optional(v.id("creative_os_concepts")),
    variant_id: v.optional(v.id("creative_os_variants")),
    decision_type: v.string(),
    rationale: v.string(),
    confidence: v.optional(v.number()),
    actor: v.string(),
    created_at: v.string(),
  })
    .index("by_concept_id", ["concept_id"])
    .index("by_variant_id", ["variant_id"])
    .index("by_created_at", ["created_at"]),

  creative_os_sync_runs: defineTable({
    source: v.string(),
    account_ref: v.optional(v.string()),
    status: v.string(),
    started_at: v.string(),
    finished_at: v.optional(v.string()),
    records_updated: v.number(),
    error_message: v.optional(v.string()),
  })
    .index("by_source", ["source"])
    .index("by_status", ["status"])
    .index("by_started_at", ["started_at"]),

  reports: defineTable({
    account_id: v.optional(v.string()),
    campaign_goal: v.string(),
    total_spend: v.number(),
    total_impressions: v.number(),
    avg_roas: v.number(),
    avg_ctr: v.number(),
    avg_cpa: v.number(),
    creative_count: v.number(),
    top_performers: v.string(),
    bottom_performers: v.string(),
    window_start: v.optional(v.string()),
    window_end: v.optional(v.string()),
    window_days: v.number(),
    previous_report_id: v.optional(v.id("reports")),
    comparison_data: v.optional(v.string()),
    raw_data: v.optional(v.string()),
    funnel_breakdown: v.optional(v.string()),
    creative_mix: v.optional(v.string()),
    recommendations: v.optional(v.string()),
    detailed_metrics: v.optional(v.string()),
  })
    .index("by_account_id", ["account_id"]),
});
