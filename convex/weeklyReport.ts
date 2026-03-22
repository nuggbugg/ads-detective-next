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

// Query creatives for funnel stage breakdown + image URLs for top creatives
export const _getFunnelData = internalQuery({
  args: {},
  handler: async (ctx) => {
    const creatives = await ctx.db.query("creatives").collect();
    const withSpend = creatives.filter((c) => c.spend > 0 && c.funnel_stage);
    const stages: Record<string, { spend: number; roas_sum: number; count: number; impressions: number; purchases: number }> = {};
    for (const c of withSpend) {
      const stage = (c.funnel_stage || "unknown").toUpperCase();
      if (!stages[stage]) stages[stage] = { spend: 0, roas_sum: 0, count: 0, impressions: 0, purchases: 0 };
      stages[stage].spend += c.spend;
      stages[stage].roas_sum += c.roas;
      stages[stage].count++;
      stages[stage].impressions += c.impressions;
      stages[stage].purchases += c.purchases;
    }
    const totalSpend = Object.values(stages).reduce((s, v) => s + v.spend, 0);
    const result: Record<string, { spend: number; roas: number; impressions: number; purchases: number; pct: number }> = {};
    for (const [k, v] of Object.entries(stages)) {
      result[k] = {
        spend: Math.round(v.spend),
        roas: v.count > 0 ? Math.round((v.roas_sum / v.count) * 100) / 100 : 0,
        impressions: v.impressions,
        purchases: v.purchases,
        pct: totalSpend > 0 ? Math.round((v.spend / totalSpend) * 100) : 0,
      };
    }

    // Build ad_name → image URL map
    const imageMap: Record<string, string> = {};
    for (const c of creatives) {
      let url = c.image_url || c.thumbnail_url || null;
      if (c.image_storage_id) {
        const storageUrl = await ctx.storage.getUrl(c.image_storage_id);
        if (storageUrl) url = storageUrl;
      }
      if (url && c.ad_name) imageMap[c.ad_name] = url;
    }

    return { stages: result, imageMap };
  },
});

export const gather = action({
  args: {},
  handler: async (ctx): Promise<Record<string, unknown>> => {
    const tokens: any = await ctx.runQuery(internal.weeklyReport._getTokens);
    if (!tokens.shopifyToken && !tokens.metaToken) return { error: "No tokens configured" };

    const now = new Date();
    const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);
    const prevWeekStart = new Date(now); prevWeekStart.setDate(prevWeekStart.getDate() - 14);
    const prevWeekEnd = new Date(now); prevWeekEnd.setDate(prevWeekEnd.getDate() - 7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const fmtDate = (d: Date) => d.toISOString().split("T")[0];
    const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];

    // === SHOPIFY: Fetch orders from prev week start (14d ago) through now ===
    let allOrders: Array<Record<string, unknown>> = [];

    if (tokens.shopifyToken) {
      const fetchUrl =
        `https://${SHOPIFY_STORE}/admin/api/${SHOPIFY_API_VERSION}/orders.json` +
        `?status=any&created_at_min=${prevWeekStart.toISOString()}&limit=250`;

      let nextUrl: string | null = fetchUrl;
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

      // Also fetch from month start if it's before prevWeekStart
      if (monthStart < prevWeekStart) {
        const monthUrl =
          `https://${SHOPIFY_STORE}/admin/api/${SHOPIFY_API_VERSION}/orders.json` +
          `?status=any&created_at_min=${monthStart.toISOString()}&created_at_max=${prevWeekStart.toISOString()}&limit=250`;
        let nu: string | null = monthUrl;
        while (nu) {
          const res: Response = await fetch(nu, {
            headers: { "X-Shopify-Access-Token": tokens.shopifyToken },
          });
          if (!res.ok) break;
          const data = await res.json() as { orders: Array<Record<string, unknown>> };
          allOrders = allOrders.concat(data.orders);
          const lh: string | null = res.headers.get("link");
          nu = null;
          if (lh) {
            const mx: RegExpMatchArray | null = lh.match(/<([^>]+)>;\s*rel="next"/);
            if (mx) nu = mx[1];
          }
        }
      }
    }

    const processOrders = (orders: Array<Record<string, unknown>>) => {
      const online = orders.filter((o) => {
        const ot = ((o.tags as string) || "").split(",").map((t) => t.trim().toLowerCase());
        const ct = ((o as any).customer?.tags || "").split(",").map((t: string) => t.trim().toLowerCase());
        return !ot.includes("b2b") && !ct.includes("b2b");
      });

      let rev = 0, boxes = 0, subRev = 0, subOrders = 0, otRev = 0, otOrders = 0;
      let newCustomers = 0, returningCustomers = 0, newRevenue = 0, returningRevenue = 0;

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

        // New vs Returning
        const customerOrdersCount = (o as any).customer?.orders_count;
        if (customerOrdersCount !== undefined && customerOrdersCount !== null) {
          if (customerOrdersCount <= 1) {
            newCustomers++;
            newRevenue += r;
          } else {
            returningCustomers++;
            returningRevenue += r;
          }
        } else {
          newCustomers++; // No customer data = likely new
          newRevenue += r;
        }
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
        new_customers: newCustomers,
        returning_customers: returningCustomers,
        new_revenue: Math.round(newRevenue),
        returning_revenue: Math.round(returningRevenue),
        new_pct: online.length > 0 ? Math.round((newCustomers / online.length) * 100) : 0,
      };
    };

    const thisWeekOrders = allOrders.filter((o) => new Date(o.created_at as string) >= weekAgo);
    const prevWeekOrders = allOrders.filter((o) => {
      const d = new Date(o.created_at as string);
      return d >= prevWeekStart && d < prevWeekEnd;
    });
    const mtdOrders = allOrders.filter((o) => new Date(o.created_at as string) >= monthStart);

    const weekShopify = processOrders(thisWeekOrders);
    const prevWeekShopify = processOrders(prevWeekOrders);
    const mtdShopify = processOrders(mtdOrders);

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
      const roas = ins.purchase_roas?.[0]?.value ? parseFloat(ins.purchase_roas[0].value) : spend > 0 && pv > 0 ? pv / spend : 0;
      return {
        spend: Math.round(spend), impressions: parseInt(ins.impressions) || 0,
        clicks: parseInt(ins.clicks) || 0, purchases, pv: Math.round(pv), leads,
        ctr: Math.round((parseFloat(ins.ctr) || 0) * 100) / 100,
        roas: Math.round(roas * 100) / 100,
      };
    };

    type AdData = { name: string; spend: number; roas: number; purchases: number; ctr: number };

    let metaWeek = parseIns(null);
    let metaPrevWeek = parseIns(null);
    let metaMtd = parseIns(null);
    let weekAds: AdData[] = [];
    let prevWeekAds: AdData[] = [];
    let mtdAds: AdData[] = [];

    if (tokens.metaToken && tokens.accountId) {
      const aid = tokens.accountId;
      const tk = tokens.metaToken;

      const fetchIns = async (since: string, until: string) => {
        const tr = JSON.stringify({ since, until });
        const url = `${META_API_BASE}/act_${aid}/insights?fields=spend,impressions,clicks,ctr,actions,action_values,purchase_roas&time_range=${encodeURIComponent(tr)}&level=account`;
        const r = await fetch(url, { headers: { Authorization: `Bearer ${tk}` } });
        if (!r.ok) return null;
        const d = await r.json();
        return d.data?.[0] || null;
      };

      const fetchTopAds = async (since: string, until: string): Promise<AdData[]> => {
        const tr = JSON.stringify({ since, until });
        const fields = "ad_name,spend,impressions,clicks,ctr,actions,action_values,purchase_roas";
        const url = `${META_API_BASE}/act_${aid}/insights?fields=${fields}&time_range=${encodeURIComponent(tr)}&level=ad&limit=50&sort=spend_descending`;
        const r = await fetch(url, { headers: { Authorization: `Bearer ${tk}` } });
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
            return { name: ad.ad_name as string, spend: Math.round(spend), roas: Math.round(roas * 100) / 100, purchases, ctr: Math.round((parseFloat(ad.ctr) || 0) * 100) / 100 };
          })
          .filter((c: AdData) => c.spend > 0);
      };

      // Fetch all 3 periods + ad-level for current + prev week in parallel
      const [wIns, pwIns, mIns, wAdsData, pwAdsData, mAdsData] = await Promise.all([
        fetchIns(fmtDate(weekAgo), fmtDate(now)),
        fetchIns(fmtDate(prevWeekStart), fmtDate(prevWeekEnd)),
        fetchIns(fmtDate(monthStart), fmtDate(now)),
        fetchTopAds(fmtDate(weekAgo), fmtDate(now)),
        fetchTopAds(fmtDate(prevWeekStart), fmtDate(prevWeekEnd)),
        fetchTopAds(fmtDate(monthStart), fmtDate(now)),
      ]);

      metaWeek = parseIns(wIns);
      metaPrevWeek = parseIns(pwIns);
      metaMtd = parseIns(mIns);
      weekAds = [...wAdsData].sort((a, b) => b.roas - a.roas).slice(0, 5);
      prevWeekAds = [...pwAdsData].sort((a, b) => b.roas - a.roas).slice(0, 5);
      mtdAds = [...mAdsData].sort((a, b) => b.roas - a.roas).slice(0, 5);

      // === CREATIVE HEALTH: Compare current vs prev week per ad ===
    }

    // Creative fatigue detection
    const adMap = new Map<string, { curr: AdData; prev: AdData }>();
    for (const ad of weekAds) adMap.set(ad.name, { curr: ad, prev: { name: ad.name, spend: 0, roas: 0, purchases: 0, ctr: 0 } });
    for (const ad of prevWeekAds) {
      const existing = adMap.get(ad.name);
      if (existing) existing.prev = ad;
    }

    const fatigued: Array<{ name: string; ctr_drop_pct: number; roas_drop_pct: number; spend: number }> = [];
    const scaling: Array<{ name: string; spend_increase_pct: number; roas: number; spend: number }> = [];

    for (const [, { curr, prev }] of adMap) {
      if (prev.spend > 20 && curr.spend > 20) {
        // Fatigue: CTR or ROAS dropped significantly
        const ctrDrop = prev.ctr > 0 ? Math.round(((prev.ctr - curr.ctr) / prev.ctr) * 100) : 0;
        const roasDrop = prev.roas > 0 ? Math.round(((prev.roas - curr.roas) / prev.roas) * 100) : 0;
        if (ctrDrop > 20 || roasDrop > 30) {
          fatigued.push({ name: curr.name, ctr_drop_pct: ctrDrop, roas_drop_pct: roasDrop, spend: curr.spend });
        }
        // Scaling: Spend increased but ROAS maintained
        const spendIncrease = prev.spend > 0 ? Math.round(((curr.spend - prev.spend) / prev.spend) * 100) : 0;
        if (spendIncrease > 20 && curr.roas >= prev.roas * 0.8) {
          scaling.push({ name: curr.name, spend_increase_pct: spendIncrease, roas: curr.roas, spend: curr.spend });
        }
      }
    }

    // Top spend share
    const totalWeekSpend = weekAds.reduce((s, a) => s + a.spend, 0);
    const topSpendShare = weekAds.slice(0, 3).map((a) => ({
      name: a.name,
      spend: a.spend,
      share_pct: totalWeekSpend > 0 ? Math.round((a.spend / totalWeekSpend) * 100) : 0,
    }));

    // Funnel stage breakdown + image map from DB
    const funnelData: any = await ctx.runQuery(internal.weeklyReport._getFunnelData);
    const funnelStages = funnelData.stages || {};
    const imageMap: Record<string, string> = funnelData.imageMap || {};

    // Attach image URLs to top creatives
    const attachImages = (ads: AdData[]) =>
      ads.map((a) => ({ ...a, image_url: imageMap[a.name] || null }));

    const blendedFn = (rev: number, spend: number) => spend > 0 ? Math.round((rev / spend) * 100) / 100 : 0;
    const cacFn = (spend: number, purchases: number) => purchases > 0 ? Math.round(spend / purchases) : 0;

    return {
      month: `${monthNames[now.getMonth()]} ${now.getFullYear()}`,
      generated_at: now.toISOString(),
      week: {
        shopify: weekShopify,
        meta: metaWeek,
        blended_roas: blendedFn(weekShopify.revenue, metaWeek.spend),
        cac: cacFn(metaWeek.spend, metaWeek.purchases),
        cr: metaWeek.clicks > 0 ? Math.round((metaWeek.purchases / metaWeek.clicks) * 10000) / 100 : 0,
        top_creatives: attachImages(weekAds),
      },
      prev_week: {
        shopify: prevWeekShopify,
        meta: metaPrevWeek,
        blended_roas: blendedFn(prevWeekShopify.revenue, metaPrevWeek.spend),
        cac: cacFn(metaPrevWeek.spend, metaPrevWeek.purchases),
        cr: metaPrevWeek.clicks > 0 ? Math.round((metaPrevWeek.purchases / metaPrevWeek.clicks) * 10000) / 100 : 0,
        top_creatives: attachImages(prevWeekAds),
      },
      mtd: {
        shopify: mtdShopify,
        meta: metaMtd,
        blended_roas: blendedFn(mtdShopify.revenue, metaMtd.spend),
        cac: cacFn(metaMtd.spend, metaMtd.purchases),
        cr: metaMtd.clicks > 0 ? Math.round((metaMtd.purchases / metaMtd.clicks) * 10000) / 100 : 0,
        top_creatives: attachImages(mtdAds),
      },
      funnel_stages: funnelStages,
      creative_health: {
        fatigued: fatigued.sort((a, b) => b.roas_drop_pct - a.roas_drop_pct).slice(0, 5),
        scaling: scaling.sort((a, b) => b.spend_increase_pct - a.spend_increase_pct).slice(0, 5),
        top_spend_share: topSpendShare,
      },
    };
  },
});
