import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    return await ctx.db.query("ad_accounts").order("desc").collect();
  },
});

export const getById = query({
  args: { id: v.id("ad_accounts") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    return await ctx.db.get(id);
  },
});

export const add = mutation({
  args: {
    meta_account_id: v.string(),
    name: v.string(),
    currency: v.string(),
  },
  handler: async (ctx, { meta_account_id, name, currency }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Unauthenticated");
    // Check for existing
    const existing = await ctx.db
      .query("ad_accounts")
      .withIndex("by_meta_account_id", (q) => q.eq("meta_account_id", meta_account_id))
      .first();
    if (existing) {
      throw new Error("Account already exists");
    }
    const now = new Date().toISOString();
    return await ctx.db.insert("ad_accounts", {
      meta_account_id,
      name,
      currency,
      is_active: true,
      updated_at: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("ad_accounts"),
    name: v.optional(v.string()),
    is_active: v.optional(v.boolean()),
    last_synced_at: v.optional(v.string()),
    currency: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...updates }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Unauthenticated");
    const filtered: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (updates.name !== undefined) filtered.name = updates.name;
    if (updates.is_active !== undefined) filtered.is_active = updates.is_active;
    if (updates.last_synced_at !== undefined) filtered.last_synced_at = updates.last_synced_at;
    if (updates.currency !== undefined) filtered.currency = updates.currency;
    await ctx.db.patch(id, filtered);
  },
});

export const remove = mutation({
  args: { id: v.id("ad_accounts") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Unauthenticated");
    await ctx.db.delete(id);
  },
});

// Internal variants for sync actions (no auth context)
export const _list = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("ad_accounts").order("desc").collect();
  },
});

export const _getById = internalQuery({
  args: { id: v.id("ad_accounts") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

export const _update = internalMutation({
  args: {
    id: v.id("ad_accounts"),
    name: v.optional(v.string()),
    is_active: v.optional(v.boolean()),
    last_synced_at: v.optional(v.string()),
    currency: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...updates }) => {
    const filtered: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (updates.name !== undefined) filtered.name = updates.name;
    if (updates.is_active !== undefined) filtered.is_active = updates.is_active;
    if (updates.last_synced_at !== undefined) filtered.last_synced_at = updates.last_synced_at;
    if (updates.currency !== undefined) filtered.currency = updates.currency;
    await ctx.db.patch(id, filtered);
  },
});
