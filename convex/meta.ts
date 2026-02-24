// Meta Graph API helpers — used by sync.ts actions

const API_BASE = "https://graph.facebook.com/v21.0";

export async function metaRequest(url: string, token: string) {
  // Strip access_token from URL if present (e.g. in pagination next-URLs)
  const cleanUrl = stripAccessToken(url);
  const res = await fetch(cleanUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (data.error) {
    throw new Error(data.error.message || "Meta API error");
  }
  return data;
}

/** Remove access_token query parameter from a URL to avoid leaking it in logs. */
function stripAccessToken(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete("access_token");
    return parsed.toString();
  } catch {
    // If URL parsing fails, return as-is
    return url;
  }
}

export async function metaPaginate(url: string, token: string) {
  let results: unknown[] = [];
  let nextUrl: string | null = url;

  while (nextUrl) {
    const data = await metaRequest(nextUrl, token);
    if (data.data) {
      results = results.concat(data.data);
    }
    nextUrl = data.paging?.next || null;
  }

  return results;
}

export async function fetchAdAccounts(token: string) {
  const accounts = await metaPaginate(
    `${API_BASE}/me/adaccounts?fields=account_id,name,account_status,currency`,
    token
  );
  return (accounts as Array<Record<string, unknown>>).map((a) => ({
    account_id: a.account_id as string,
    id: a.id as string,
    name: a.name as string,
    status: a.account_status as number,
    currency: (a.currency as string) || "USD",
  }));
}

export async function fetchAdsWithInsights(
  token: string,
  accountId: string,
  since: string,
  until: string
) {
  const fields = [
    "ad_id", "ad_name", "adset_name", "campaign_name",
    "objective", "spend", "impressions", "clicks",
    "ctr", "cpc", "cpm",
    "actions", "action_values", "purchase_roas",
    "video_p25_watched_actions", "video_p50_watched_actions",
    "video_p75_watched_actions", "video_p100_watched_actions",
    "video_thruplay_watched_actions",
  ].join(",");

  const timeRange = JSON.stringify({ since, until });
  const url = `${API_BASE}/act_${accountId}/insights?level=ad&fields=${fields}&time_range=${encodeURIComponent(timeRange)}&limit=500`;

  return metaPaginate(url, token);
}

export async function fetchAds(token: string, accountId: string) {
  const fields = "id,name,status,creative{id,thumbnail_url,image_url,image_hash,video_id,object_type,asset_feed_spec{images}}";
  const url = `${API_BASE}/act_${accountId}/ads?fields=${fields}&limit=500`;
  return metaPaginate(url, token);
}

/**
 * Fetch full-res image blobs for ads.
 * Returns a map of adId → { blob, hash } for storage.
 */
export async function fetchFullResImageBlobs(
  token: string,
  accountId: string,
  ads: Array<Record<string, unknown>>
) {
  const hashToAdIds = new Map<string, string[]>();

  for (const ad of ads) {
    const creative = ad.creative as Record<string, unknown> | undefined;
    if (!creative) continue;

    let hash: string | null = null;

    const assetFeedSpec = creative.asset_feed_spec as { images?: Array<{ hash: string }> } | undefined;
    if (assetFeedSpec?.images?.length) {
      hash = assetFeedSpec.images[0].hash;
    }
    if (!hash && creative.image_hash) {
      hash = creative.image_hash as string;
    }

    if (hash) {
      if (!hashToAdIds.has(hash)) hashToAdIds.set(hash, []);
      hashToAdIds.get(hash)!.push(ad.id as string);
    }
  }

  if (hashToAdIds.size === 0) return new Map<string, Blob>();

  const allHashes = Array.from(hashToAdIds.keys());
  const adIdToBlob = new Map<string, Blob>();
  const BATCH_SIZE = 50;

  for (let i = 0; i < allHashes.length; i += BATCH_SIZE) {
    const batch = allHashes.slice(i, i + BATCH_SIZE);

    try {
      const hashesParam = encodeURIComponent(JSON.stringify(batch));
      const url = `${API_BASE}/act_${accountId}/adimages?hashes=${hashesParam}&fields=hash,permalink_url,width,height`;
      const data = await metaRequest(url, token);

      if (!data.data) continue;

      for (const img of data.data as Array<Record<string, string>>) {
        if (!img.permalink_url || !img.hash) continue;

        const adIds = hashToAdIds.get(img.hash) || [];

        try {
          const res = await fetch(img.permalink_url, {
            headers: { "User-Agent": "Mozilla/5.0" },
            redirect: "follow",
          });

          if (!res.ok) continue;

          const blob = await res.blob();
          if (blob.size < 1024) continue; // Skip tiny files

          for (const adId of adIds) {
            adIdToBlob.set(adId, blob);
          }
        } catch {
          // Skip failed downloads
        }
      }
    } catch {
      // Skip failed batches
    }
  }

  return adIdToBlob;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeInsight(insight: Record<string, any>, adsMap: Map<string, any>) {
  const adId = insight.ad_id;
  const ad = adsMap.get(adId) || {};

  // Extract conversions from actions — purchases AND leads
  let purchases = 0;
  let purchaseValue = 0;
  let leads = 0;

  if (insight.actions) {
    const purchaseAction = insight.actions.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (a: any) => a.action_type === "purchase" || a.action_type === "offsite_conversion.fb_pixel_purchase"
    );
    if (purchaseAction) purchases = parseInt(purchaseAction.value) || 0;

    const leadAction = insight.actions.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (a: any) =>
        a.action_type === "lead" ||
        a.action_type === "offsite_conversion.fb_pixel_lead" ||
        a.action_type === "onsite_conversion.lead_grouped"
    );
    if (leadAction) leads = parseInt(leadAction.value) || 0;
  }

  if (insight.action_values) {
    const purchaseVal = insight.action_values.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (a: any) => a.action_type === "purchase" || a.action_type === "offsite_conversion.fb_pixel_purchase"
    );
    if (purchaseVal) purchaseValue = parseFloat(purchaseVal.value) || 0;
  }

  const spend = parseFloat(insight.spend) || 0;
  const roas = insight.purchase_roas?.[0]?.value
    ? parseFloat(insight.purchase_roas[0].value)
    : spend > 0 && purchaseValue > 0
    ? purchaseValue / spend
    : 0;

  const conversions = leads > 0 ? leads : purchases;
  const cpa = conversions > 0 ? spend / conversions : 0;

  // Video metrics
  const videoP25 = parseInt(insight.video_p25_watched_actions?.[0]?.value) || 0;
  const videoP50 = parseInt(insight.video_p50_watched_actions?.[0]?.value) || 0;
  const videoP75 = parseInt(insight.video_p75_watched_actions?.[0]?.value) || 0;
  const videoP100 = parseInt(insight.video_p100_watched_actions?.[0]?.value) || 0;
  const videoThruplay = parseInt(insight.video_thruplay_watched_actions?.[0]?.value) || 0;

  // Determine ad type
  let adType = "image";
  if (ad.creative?.object_type === "VIDEO" || videoThruplay > 0) {
    adType = "video";
  } else if (ad.creative?.object_type === "SHARE" && ad.name?.toLowerCase().includes("carousel")) {
    adType = "carousel";
  }

  return {
    ad_id: adId,
    ad_name: insight.ad_name,
    ad_status: ad.status || "UNKNOWN",
    campaign_name: insight.campaign_name,
    campaign_objective: insight.objective,
    adset_name: insight.adset_name,
    ad_type: adType,
    thumbnail_url: ad.creative?.thumbnail_url || ad.creative?.image_url || null,
    spend,
    impressions: parseInt(insight.impressions) || 0,
    clicks: parseInt(insight.clicks) || 0,
    ctr: parseFloat(insight.ctr) || 0,
    cpc: parseFloat(insight.cpc) || 0,
    cpm: parseFloat(insight.cpm) || 0,
    purchases,
    leads,
    conversions,
    purchase_value: purchaseValue,
    roas: Math.round(roas * 100) / 100,
    cpa: Math.round(cpa * 100) / 100,
    video_p25: videoP25,
    video_p50: videoP50,
    video_p75: videoP75,
    video_p100: videoP100,
    video_thruplay: videoThruplay,
    date_start: insight.date_start,
    date_stop: insight.date_stop,
  };
}
