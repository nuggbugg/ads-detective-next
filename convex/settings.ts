import { query, mutation, action, internalQuery } from "./_generated/server";
import { v } from "convex/values";

// Currency symbol map
const CURRENCY_MAP: Record<string, { symbol: string; position: "before" | "after" }> = {
  USD: { symbol: "$", position: "before" },
  EUR: { symbol: "€", position: "before" },
  GBP: { symbol: "£", position: "before" },
  SEK: { symbol: "kr", position: "after" },
  NOK: { symbol: "kr", position: "after" },
  DKK: { symbol: "kr", position: "after" },
  ISK: { symbol: "kr", position: "after" },
  CZK: { symbol: "Kč", position: "after" },
  HUF: { symbol: "Ft", position: "after" },
  PLN: { symbol: "zł", position: "after" },
  RON: { symbol: "lei", position: "after" },
  JPY: { symbol: "¥", position: "before" },
  CNY: { symbol: "¥", position: "before" },
  KRW: { symbol: "₩", position: "before" },
  INR: { symbol: "₹", position: "before" },
  BRL: { symbol: "R$", position: "before" },
  MXN: { symbol: "$", position: "before" },
  AUD: { symbol: "A$", position: "before" },
  CAD: { symbol: "C$", position: "before" },
  CHF: { symbol: "CHF", position: "before" },
  NZD: { symbol: "NZ$", position: "before" },
  SGD: { symbol: "S$", position: "before" },
  HKD: { symbol: "HK$", position: "before" },
  TWD: { symbol: "NT$", position: "before" },
  THB: { symbol: "฿", position: "before" },
  TRY: { symbol: "₺", position: "before" },
  ZAR: { symbol: "R", position: "before" },
  RUB: { symbol: "₽", position: "after" },
  ILS: { symbol: "₪", position: "before" },
  AED: { symbol: "د.إ", position: "before" },
  SAR: { symbol: "﷼", position: "before" },
  PHP: { symbol: "₱", position: "before" },
  MYR: { symbol: "RM", position: "before" },
  IDR: { symbol: "Rp", position: "before" },
  VND: { symbol: "₫", position: "after" },
  ARS: { symbol: "$", position: "before" },
  CLP: { symbol: "$", position: "before" },
  COP: { symbol: "$", position: "before" },
  PEN: { symbol: "S/", position: "before" },
  UAH: { symbol: "₴", position: "before" },
  NGN: { symbol: "₦", position: "before" },
  EGP: { symbol: "E£", position: "before" },
  PKR: { symbol: "₨", position: "before" },
  BDT: { symbol: "৳", position: "before" },
  QAR: { symbol: "﷼", position: "before" },
  KWD: { symbol: "د.ك", position: "before" },
  BHD: { symbol: ".د.ب", position: "before" },
  OMR: { symbol: "﷼", position: "before" },
};

function maskSecret(value: string): string {
  if (!value || value.length < 10) return value ? "****" : "";
  return value.slice(0, 4) + "****" + value.slice(-4);
}

const ALLOWED_KEYS = [
  "meta_access_token",
  "gemini_api_key",
  "date_range_days",
  "sync_frequency",
  "campaign_goal",
  "winner_roas_threshold",
  "winner_cpa_threshold",
  "iteration_spend_threshold",
];

export const getAll = query({
  args: {},
  handler: async (ctx) => {
    const settings = await ctx.db.query("settings").collect();
    const result: Record<string, string> = {};
    for (const s of settings) {
      result[s.key] = s.value;
    }

    // Mask secrets
    const masked: Record<string, string | boolean> = { ...result };
    if (result.meta_access_token) {
      masked.meta_access_token = maskSecret(result.meta_access_token);
    }
    if (result.gemini_api_key) {
      masked.gemini_api_key = maskSecret(result.gemini_api_key);
    }
    masked._has_meta_token = !!result.meta_access_token;
    masked._has_gemini_key = !!result.gemini_api_key;
    return masked;
  },
});

export const get = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const setting = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();
    return setting?.value ?? null;
  },
});

export const setMany = mutation({
  args: { settings: v.record(v.string(), v.string()) },
  handler: async (ctx, { settings }) => {
    for (const [key, value] of Object.entries(settings)) {
      if (!ALLOWED_KEYS.includes(key)) continue;
      const existing = await ctx.db
        .query("settings")
        .withIndex("by_key", (q) => q.eq("key", key))
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, { value });
      } else {
        await ctx.db.insert("settings", { key, value });
      }
    }
  },
});

export const getCurrency = query({
  args: {},
  handler: async (ctx) => {
    // Get the first active account's currency
    const account = await ctx.db
      .query("ad_accounts")
      .withIndex("by_active", (q) => q.eq("is_active", true))
      .first();
    const code = account?.currency || "USD";
    const info = CURRENCY_MAP[code] || { symbol: code, position: "before" as const };
    return { code, symbol: info.symbol, position: info.position };
  },
});

export const seedDefaults = mutation({
  args: {},
  handler: async (ctx) => {
    const defaults: Record<string, string> = {
      meta_access_token: "",
      gemini_api_key: "",
      date_range_days: "30",
      sync_frequency: "manual",
      campaign_goal: "roas",
      winner_roas_threshold: "2.0",
      winner_cpa_threshold: "30",
      iteration_spend_threshold: "50",
    };
    for (const [key, value] of Object.entries(defaults)) {
      const existing = await ctx.db
        .query("settings")
        .withIndex("by_key", (q) => q.eq("key", key))
        .first();
      if (!existing) {
        await ctx.db.insert("settings", { key, value });
      }
    }
  },
});

export const testMetaConnection = action({
  args: { token: v.string() },
  handler: async (_ctx, { token }) => {
    const API_BASE = "https://graph.facebook.com/v21.0";

    // Test the token
    const userRes = await fetch(`${API_BASE}/me?access_token=${token}`);
    if (!userRes.ok) {
      const err = await userRes.json();
      throw new Error(err.error?.message || "Invalid token");
    }
    const user = await userRes.json();

    // Fetch ad accounts
    const accountsRes = await fetch(
      `${API_BASE}/me/adaccounts?fields=account_id,id,name,account_status,currency&access_token=${token}`
    );
    if (!accountsRes.ok) {
      throw new Error("Failed to fetch ad accounts");
    }
    const accountsData = await accountsRes.json();

    return {
      valid: true,
      user: { id: user.id, name: user.name },
      accounts: accountsData.data || [],
    };
  },
});
