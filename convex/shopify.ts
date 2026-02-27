import { action, query, internalMutation, httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

const SHOPIFY_STORE = "mobynutrition.myshopify.com";
const SHOPIFY_CLIENT_ID = "1eeb3ae5b341187536602380c950b1c1";
const SHOPIFY_SCOPES = "read_orders,read_all_orders,read_products,read_inventory";
const SHOPIFY_API_VERSION = "2026-01";
const SALES_GOAL = 500;

// --- OAuth ---

export const startOAuth = action({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Unauthenticated");

    const siteUrl = process.env.CONVEX_SITE_URL;
    if (!siteUrl) throw new Error("CONVEX_SITE_URL not configured");

    const redirectUri = `${siteUrl}/shopify/callback`;
    const authorizeUrl =
      `https://${SHOPIFY_STORE}/admin/oauth/authorize` +
      `?client_id=${SHOPIFY_CLIENT_ID}` +
      `&scope=${SHOPIFY_SCOPES}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}`;

    return { url: authorizeUrl };
  },
});

export const handleCallback = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const shop = url.searchParams.get("shop");

  if (!code || !shop) {
    return new Response("Missing code or shop parameter", { status: 400 });
  }

  // Exchange code for permanent access token
  const tokenRes = await fetch(
    `https://${SHOPIFY_STORE}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: SHOPIFY_CLIENT_ID,
        client_secret: process.env.SHOPIFY_CLIENT_SECRET!,
        code,
      }),
    }
  );

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    return new Response(`Failed to exchange token: ${err}`, { status: 500 });
  }

  const { access_token } = (await tokenRes.json()) as { access_token: string };

  // Store the token in settings
  await ctx.runMutation(internal.shopify._storeToken, {
    token: access_token,
  });

  // Redirect back to the app settings page
  const appUrl = process.env.SITE_URL || "http://localhost:3001";
  return new Response(null, {
    status: 302,
    headers: { Location: `${appUrl}/settings?shopify=connected` },
  });
});

export const _storeToken = internalMutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const existing = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "shopify_access_token"))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { value: token });
    } else {
      await ctx.db.insert("settings", {
        key: "shopify_access_token",
        value: token,
      });
    }
  },
});

// --- Sales Data ---

export const fetchMonthlySales = action({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Unauthenticated");

    // Get Shopify token
    const token = await ctx.runQuery(internal.settings.get, {
      key: "shopify_access_token",
    });
    if (!token) throw new Error("Shopify not connected");

    // Calculate current month start (UTC)
    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
    );
    const monthName = now.toLocaleString("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });

    // Fetch orders for current month, paginating through all
    const baseUrl =
      `https://${SHOPIFY_STORE}/admin/api/${SHOPIFY_API_VERSION}/orders.json` +
      `?status=any&created_at_min=${monthStart.toISOString()}&limit=250&fields=id,line_items`;

    let totalQuantity = 0;
    let nextUrl: string | null = baseUrl;

    while (nextUrl) {
      const res: Response = await fetch(nextUrl, {
        headers: { "X-Shopify-Access-Token": token },
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Shopify API error: ${err}`);
      }

      const data = (await res.json()) as {
        orders: Array<{
          line_items: Array<{ quantity: number }>;
        }>;
      };

      for (const order of data.orders) {
        for (const item of order.line_items) {
          totalQuantity += item.quantity;
        }
      }

      // Check for pagination via Link header
      const linkHeader: string | null = res.headers.get("link");
      nextUrl = null;
      if (linkHeader) {
        const nextMatch: RegExpMatchArray | null = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        if (nextMatch) {
          nextUrl = nextMatch[1];
        }
      }
    }

    // Cache the result in settings
    const cacheData = JSON.stringify({
      sold: totalQuantity,
      goal: SALES_GOAL,
      month: monthName,
      last_fetched: new Date().toISOString(),
    });

    await ctx.runMutation(internal.shopify._cacheSales, { data: cacheData });

    return { sold: totalQuantity, goal: SALES_GOAL, month: monthName };
  },
});

export const _cacheSales = internalMutation({
  args: { data: v.string() },
  handler: async (ctx, { data }) => {
    const existing = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "shopify_sales"))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { value: data });
    } else {
      await ctx.db.insert("settings", { key: "shopify_sales", value: data });
    }
  },
});

export const getSalesGoal = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;

    const cached = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "shopify_sales"))
      .first();

    if (!cached) return null;

    try {
      return JSON.parse(cached.value) as {
        sold: number;
        goal: number;
        month: string;
        last_fetched: string;
      };
    } catch {
      return null;
    }
  },
});

export const disconnect = action({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Unauthenticated");

    await ctx.runMutation(internal.shopify._removeToken);
  },
});

export const _removeToken = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Remove token
    const token = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "shopify_access_token"))
      .first();
    if (token) await ctx.db.delete(token._id);

    // Remove cached sales
    const sales = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "shopify_sales"))
      .first();
    if (sales) await ctx.db.delete(sales._id);
  },
});
