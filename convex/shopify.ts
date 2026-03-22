import { action, query, internalMutation } from "./_generated/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

const SHOPIFY_STORE = "mobynutrition.myshopify.com";
const SHOPIFY_CLIENT_ID = "1eeb3ae5b341187536602380c950b1c1";
const SHOPIFY_API_VERSION = "2026-01";
const SHOPIFY_SCOPES = "read_orders,read_products,read_analytics";
const SALES_GOAL = 500;

// Manual B2B adjustments (orders outside Shopify)
const MANUAL_B2B_BOXES = 12;
const MANUAL_B2B_REVENUE = 2016; // kr inc taxes

// --- OAuth Flow ---

/** Returns the Shopify authorize URL for the frontend to redirect to */
export const startOAuth = action({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Unauthenticated");

    const siteUrl = process.env.CONVEX_SITE_URL;
    if (!siteUrl) throw new Error("CONVEX_SITE_URL not configured");

    const redirectUri = `${siteUrl}/shopify/callback`;
    const nonce = Math.random().toString(36).substring(2, 15);

    const authorizeUrl =
      `https://${SHOPIFY_STORE}/admin/oauth/authorize` +
      `?client_id=${SHOPIFY_CLIENT_ID}` +
      `&scope=${SHOPIFY_SCOPES}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${nonce}`;

    return { url: authorizeUrl };
  },
});

/** HTTP callback handler — Shopify redirects here with ?code=...&shop=... */
export const handleCallback = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const shop = url.searchParams.get("shop");

  if (!code || !shop) {
    return new Response("Missing code or shop parameter", { status: 400 });
  }

  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!clientSecret) {
    return new Response("Server misconfigured: missing SHOPIFY_CLIENT_SECRET", {
      status: 500,
    });
  }

  // Exchange the code for a permanent access token
  const tokenRes = await fetch(
    `https://${SHOPIFY_STORE}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: SHOPIFY_CLIENT_ID,
        client_secret: clientSecret,
        code,
      }),
    }
  );

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    console.error("Shopify token exchange failed:", errText);
    return new Response(`Token exchange failed: ${errText}`, { status: 502 });
  }

  const tokenData = (await tokenRes.json()) as { access_token: string };
  const accessToken = tokenData.access_token;

  // Store the token in the database
  await ctx.runMutation(internal.shopify._storeToken, { token: accessToken });

  // Redirect user back to the app settings page with success
  // Use SITE_URL env var (the Next.js app URL) or fallback
  const appUrl = process.env.SITE_URL || "http://localhost:3000";
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${appUrl}/settings?shopify=connected`,
    },
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
    // NOTE: Do NOT use &fields= filter — it strips nested objects like customer.tags
    const baseUrl =
      `https://${SHOPIFY_STORE}/admin/api/${SHOPIFY_API_VERSION}/orders.json` +
      `?status=any&created_at_min=${monthStart.toISOString()}&limit=250`;

    let totalQuantity = 0;
    let b2bQuantity = 0;
    let onlineQuantity = 0;
    let b2bRevenue = 0;
    let onlineRevenue = 0;
    let subscriptionRevenue = 0;
    let subscriptionOrders = 0;
    let onetimeRevenue = 0;
    let onetimeOrders = 0;
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
          id: number;
          tags: string;
          total_price: string;
          source_name?: string;
          customer?: { tags?: string };
          line_items: Array<{
            quantity: number;
            properties?: Array<{ name: string; value: string }>;
            selling_plan_allocation?: unknown;
          }>;
        }>;
      };

      for (const order of data.orders) {
        const orderQty = order.line_items.reduce((s, item) => s + item.quantity, 0);
        const orderRevenue = parseFloat(order.total_price || "0");
        totalQuantity += orderQty;

        // Check if order OR customer has a B2B tag (case-insensitive)
        const orderTags = (order.tags || "").split(",").map((t) => t.trim().toLowerCase());
        const customerTags = (order.customer?.tags || "").split(",").map((t) => t.trim().toLowerCase());
        const isB2B = orderTags.includes("b2b") || customerTags.includes("b2b");

        // Debug: log tags for first few orders to verify data
        if (data.orders.indexOf(order) < 5) {
          console.log(`Order ${order.id}: orderTags=[${orderTags}] customerTags=[${customerTags}] isB2B=${isB2B} revenue=${orderRevenue}`);
        }

        // Detect subscription orders:
        // 1. Order tags contain "subscription"
        // 2. Source name is "subscription_contract"
        // 3. Line items have selling_plan_allocation or subscription-related properties
        const isSubscription =
          orderTags.some((t) => t.includes("subscription")) ||
          (order.source_name || "").toLowerCase().includes("subscription") ||
          order.line_items.some((li) =>
            li.selling_plan_allocation != null ||
            (li.properties || []).some((p) =>
              p.name.toLowerCase().includes("subscription") ||
              p.name.toLowerCase().includes("selling_plan")
            )
          );

        if (isSubscription) {
          subscriptionRevenue += orderRevenue;
          subscriptionOrders++;
        } else {
          onetimeRevenue += orderRevenue;
          onetimeOrders++;
        }

        if (isB2B) {
          b2bQuantity += orderQty;
          b2bRevenue += orderRevenue;
        } else {
          onlineQuantity += orderQty;
          onlineRevenue += orderRevenue;
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

    // Add manual B2B adjustments (orders outside Shopify)
    totalQuantity += MANUAL_B2B_BOXES;
    b2bQuantity += MANUAL_B2B_BOXES;
    b2bRevenue += MANUAL_B2B_REVENUE;

    const totalRevenue = onlineRevenue + b2bRevenue;

    // Cache the result in settings
    const cacheData = JSON.stringify({
      sold: totalQuantity,
      b2b: b2bQuantity,
      online: onlineQuantity,
      b2b_revenue: Math.round(b2bRevenue),
      online_revenue: Math.round(onlineRevenue),
      total_revenue: Math.round(totalRevenue),
      subscription_revenue: Math.round(subscriptionRevenue),
      subscription_orders: subscriptionOrders,
      onetime_revenue: Math.round(onetimeRevenue),
      onetime_orders: onetimeOrders,
      mrr: Math.round(subscriptionRevenue), // MRR = subscription revenue this month
      goal: SALES_GOAL,
      month: monthName,
      last_fetched: new Date().toISOString(),
    });

    await ctx.runMutation(internal.shopify._cacheSales, { data: cacheData });

    return {
      sold: totalQuantity, b2b: b2bQuantity, online: onlineQuantity,
      b2b_revenue: Math.round(b2bRevenue), online_revenue: Math.round(onlineRevenue),
      total_revenue: Math.round(totalRevenue),
      subscription_revenue: Math.round(subscriptionRevenue), subscription_orders: subscriptionOrders,
      onetime_revenue: Math.round(onetimeRevenue), onetime_orders: onetimeOrders,
      mrr: Math.round(subscriptionRevenue),
      goal: SALES_GOAL, month: monthName,
    };
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
        b2b: number;
        online: number;
        b2b_revenue: number;
        online_revenue: number;
        total_revenue: number;
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
