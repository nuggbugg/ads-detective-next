// Gemini AI analysis helper — used by analysis.ts actions

interface CreativeForAnalysis {
  ad_name?: string;
  campaign_name?: string;
  campaign_objective?: string;
  adset_name?: string;
  ad_type?: string;
  spend: number;
  roas: number;
  ctr: number;
  cpa: number;
  impressions: number;
  clicks: number;
}

interface AnalysisResult {
  asset_type: string;
  visual_format: string;
  messaging_angle: string;
  hook_tactic: string;
  offer_type: string;
  funnel_stage: string;
  summary: string;
}

export async function analyzeCreative(
  apiKey: string,
  creative: CreativeForAnalysis
): Promise<AnalysisResult> {
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey });

  const prompt = `You are an expert advertising creative analyst specializing in Meta (Facebook/Instagram) ads.

Analyze this ad creative and classify it into the categories below.

Ad Name: ${creative.ad_name || "Unknown"}
Campaign: ${creative.campaign_name || "Unknown"}
Campaign Objective: ${creative.campaign_objective || "Unknown"}
Ad Set: ${creative.adset_name || "Unknown"}
Ad Type: ${creative.ad_type || "Unknown"}
Spend: $${(creative.spend || 0).toFixed(2)}
ROAS: ${(creative.roas || 0).toFixed(2)}
CTR: ${(creative.ctr || 0).toFixed(2)}%
CPA: $${(creative.cpa || 0).toFixed(2)}
Impressions: ${creative.impressions || 0}
Clicks: ${creative.clicks || 0}

Based on the ad name, campaign context, and available metadata, classify this creative.
Be specific and accurate. If you cannot determine a category with confidence, choose the closest match.

Respond with a JSON object containing these fields:
- asset_type: One of "UGC", "Studio", "Stock Photo", "Graphic Design", "Screen Recording", "Animation", "Mixed"
- visual_format: One of "Talking Head", "Product Demo", "Lifestyle", "Before/After", "Slideshow", "Testimonial", "Unboxing", "Tutorial", "Static Image", "Carousel", "Other"
- messaging_angle: One of "Pain Point", "Social Proof", "FOMO", "Aspiration", "Education", "Comparison", "Humor", "Urgency", "Authority", "Other"
- hook_tactic: One of "Question", "Bold Claim", "Statistic", "Story", "Problem Statement", "Curiosity Gap", "Social Proof Lead", "Controversy", "Other"
- offer_type: One of "Discount", "Free Trial", "Free Shipping", "Bundle", "BOGO", "Limited Time", "Evergreen", "Lead Magnet", "None", "Other"
- funnel_stage: One of "TOF", "MOF", "BOF"
- summary: A 1-2 sentence summary of the creative's likely approach and positioning`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties: {
          asset_type: { type: "string" },
          visual_format: { type: "string" },
          messaging_angle: { type: "string" },
          hook_tactic: { type: "string" },
          offer_type: { type: "string" },
          funnel_stage: { type: "string" },
          summary: { type: "string" },
        },
        required: [
          "asset_type", "visual_format", "messaging_angle",
          "hook_tactic", "offer_type", "funnel_stage", "summary",
        ],
      },
    },
  });

  const text = response.text;
  return JSON.parse(text!) as AnalysisResult;
}
