import { action, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";

const SHOPIFY_STORE = "mobynutrition.myshopify.com";
const SHOPIFY_API_VERSION = "2026-01";
const META_API_BASE = "https://graph.facebook.com/v22.0";

export const _getTokens = internalQuery({
  args: {},
  handler: async (ctx) => {
    const shopify = await ctx.db
      .query("settings")
      .withIndex("by_key", (q: any) => q.eq("key", "shopify_access_token"))
      .first();
    const meta = await ctx.db
      .query("settings")
      .withIndex("by_key", (q: any) => q.eq("key", "meta_access_token"))
      .first();
    const accounts = await ctx.db.query("ad_accounts").collect();
    return {
      shopifyToken: shopify?.value || null,
      metaToken: meta?.value || null,
      accountId: accounts[0]?.meta_account_id || null,
    };
  },
});

export const gather = action({
  args: {},
  handler: async (ctx): Promise<Record<string, unknown>> => {
    const tokens: any = await ctx.runQuery(internal.weeklyReport._getTokens);
    if (!tokens.shopifyToken && !tokens.metaToken) return { error: "No tokens configured" };

    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const fmtDate = (d: Date) => d.toISOString().split("T")[0];
    const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];

    // === SHOPIFY ===
    let allOrders: Array<Record<string, unknown>> = [];

    if (tokens.shopifyToken) {
      const monthUrl =
        `https://${SHOPIFY_STORE}/admin/api/${SHOPIFY_API_VERSION}/orders.json` +
        `?status=any&created_at_min=${monthStart.toISOString()}&limit=250`;

      let nextUrl: string | null = monthUrl;
      while (nextUrl) {
        const res: Response = await fetch(nextUrl, {
          headers: { "X-Shopify-Access-Token": tokens.shopifyToken },
        });
        if (!res.ok) break;
        const data = await res.json() as { orders: Array<Record<string, unknown>> };
        allOrders = allOrders.concat(data.orders);
        const lh: string | null = res.headers.get("link");
        nextUrl = null;
        if (lh) {
          const m: RegExpMatchArray | null = lh.match(/<([^>]+)>;\s*rel="next"/);
          if (m) nextUrl = m[1];
        }
      }
    }

    const processOrders = (orders: Array<Record<string, unknown>>) => {
      // Filter out B2B
      const online = orders.filter((o) => {
        const ot = ((o.tags as string) || "").split(",").map((t) => t.trim().toLowerCase());
        const ct = ((o as any).customer?.tags || "").split(",").map((t: string) => t.trim().toLowerCase());
        return !ot.includes("b2b") && !ct.includes("b2b");
      });

      let rev = 0, boxes = 0, subRev = 0, subOrders = 0, otRev = 0, otOrders = 0;
      for (const o of online) {
        const r = parseFloat((o.total_price as string) || "0");
        rev += r;
        const li = (o.line_items as Array<{ quantity: number; selling_plan_allocation?: unknown }>) || [];
        boxes += li.reduce((s, i) => s + i.quantity, 0);
        const ot = ((o.tags as string) || "").split(",").map((t) => t.trim().toLowerCase());
        const isSub =
          ot.some((t) => t.includes("subscription")) ||
          ((o.source_name as string) || "").toLowerCase().includes("subscription") ||
          li.some((i) => i.selling_plan_allocation != null);
        if (isSub) { subRev += r; subOrders++; } else { otRev += r; otOrders++; }
      }

      return {
        revenue: Math.round(rev),
        orders: online.length,
        boxes,
        aov: online.length > 0 ? Math.round(rev / online.length) : 0,
        sub_revenue: Math.round(subRev),
        sub_orders: subOrders,
        onetime_revenue: Math.round(otRev),
        onetime_orders: otOrders,
      };
    };

    const weekOrders = allOrders.filter((o) => new Date(o.created_at as string) >= weekAgo);
    const mtdShopify = processOrders(allOrders);
    const weekShopify = processOrders(weekOrders);

    // === META ===
    const parseIns = (ins: any) => {
      if (!ins) return { spend: 0, impressions: 0, clicks: 0, purchases: 0, pv: 0, leads: 0, ctr: 0, roas: 0 };
      const spend = parseFloat(ins.spend) || 0;
      let purchases = 0, pv = 0, leads = 0;
      for (const a of ins.actions || []) {
        if (a.action_type === "purchase" || a.action_type === "offsite_conversion.fb_pixel_purchase") purchases += parseInt(a.value) || 0;
        if (a.action_type === "lead" || a.action_type === "offsite_conversion.fb_pixel_lead") leads += parseInt(a.value) || 0;
      }
      for (const a of ins.action_values || []) {
        if (a.action_type === "purchase" || a.action_type === "offsite_conversion.fb_pixel_purchase") pv += parseFloat(a.value) || 0;
      }
      const roas = ins.purchase_roas?.[0]?.value
        ? parseFloat(ins.purchase_roas[0].value)
        : spend > 0 && pv > 0 ? pv / spend : 0;
      return {
        spend: Math.round(spend),
        impressions: parseInt(ins.impressions) || 0,
        clicks: parseInt(ins.clicks) || 0,
        purchases,
        pv: Math.round(pv),
        leads,
        ctr: Math.round((parseFloat(ins.ctr) || 0) * 100) / 100,
        roas: Math.round(roas * 100) / 100,
      };
    };

    let metaWeek = parseIns(null);
    let metaMtd = parseIns(null);
    let weekAds: Array<{ name: string; spend: number; roas: number; purchases: number; ctr: number }> = [];
    let mtdAds: Array<{ name: string; spend: number; roas: number; purchases: number; ctr: number }> = [];

    if (tokens.metaToken && tokens.accountId) {
      const aid = tokens.accountId;

      const fetchIns = async (since: string, until: string) => {
        const tr = JSON.stringify({ since, until });
        const url = `${META_API_BASE}/act_${aid}/insights?fields=spend,impressions,clicks,ctr,actions,action_values,purchase_roas&time_range=${encodeURIComponent(tr)}&level=account`;
        const r = await fetch(url, { headers: { Authorization: `Bearer ${tokens.metaToken}` } });
        if (!r.ok) return null;
        const d = await r.json();
        return d.data?.[0] || null;
      };

      const fetchTopAds = async (since: string, until: string) => {
        const tr = JSON.stringify({ since, until });
        const fields = "ad_name,spend,impressions,clicks,ctr,actions,action_values,purchase_roas";
        const url = `${META_API_BASE}/act_${aid}/insights?fields=${fields}&time_range=${encodeURIComponent(tr)}&level=ad&limit=50&sort=spend_descending`;
        const r = await fetch(url, { headers: { Authorization: `Bearer ${tokens.metaToken}` } });
        if (!r.ok) return [];
        const d = await r.json();
        return (d.data || [])
          .map((ad: any) => {
            const spend = parseFloat(ad.spend) || 0;
            let purchases = 0;
            for (const a of ad.actions || []) {
              if (a.action_type === "purchase" || a.action_type === "offsite_conversion.fb_pixel_purchase") purchases += parseInt(a.value) || 0;
            }
            const roas = ad.purchase_roas?.[0]?.value ? parseFloat(ad.purchase_roas[0].value) : 0;
            return {
              name: ad.ad_name as string,
              spend: Math.round(spend),
              roas: Math.round(roas * 100) / 100,
              purchases,
              ctr: Math.round((parseFloat(ad.ctr) || 0) * 100) / 100,
            };
          })
          .filter((c: { spend: number }) => c.spend > 0);
      };

      const [wIns, mIns, wAds, mAds] = await Promise.all([
        fetchIns(fmtDate(weekAgo), fmtDate(now)),
        fetchIns(fmtDate(monthStart), fmtDate(now)),
        fetchTopAds(fmtDate(weekAgo), fmtDate(now)),
        fetchTopAds(fmtDate(monthStart), fmtDate(now)),
      ]);

      metaWeek = parseIns(wIns);
      metaMtd = parseIns(mIns);
      weekAds = [...wAds].sort((a, b) => b.roas - a.roas).slice(0, 5);
      mtdAds = [...mAds].sort((a, b) => b.roas - a.roas).slice(0, 5);
    }

    const blended = (rev: number, spend: number) => spend > 0 ? Math.round((rev / spend) * 100) / 100 : 0;
    const cac = (spend: number, purchases: number) => purchases > 0 ? Math.round(spend / purchases) : 0;

    return {
      month: `${monthNames[now.getMonth()]} ${now.getFullYear()}`,
      generated_at: now.toISOString(),
      week: {
        shopify: weekShopify,
        meta: metaWeek,
        blended_roas: blended(weekShopify.revenue, metaWeek.spend),
        cac: cac(metaWeek.spend, metaWeek.purchases),
        top_creatives: weekAds,
      },
      mtd: {
        shopify: mtdShopify,
        meta: metaMtd,
        blended_roas: blended(mtdShopify.revenue, metaMtd.spend),
        cac: cac(metaMtd.spend, metaMtd.purchases),
        top_creatives: mtdAds,
      },
    };
  },
});
