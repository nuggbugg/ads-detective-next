"use client";

import { useEffect, useRef } from "react";

// ── Glossary — single source of truth for all definitions ──
const GLOSSARY: Record<string, string> = {
  // Core ad metrics
  "Spend": "Total amount spent on this ad or set of ads.",
  "Total Spend": "Total amount of money spent across all creatives in this period.",
  "Impressions": "Number of times the ad was shown on screen.",
  "Clicks": "Number of link clicks on the ad.",
  "CTR": "Click-Through Rate — percentage of impressions that resulted in a click. Higher is better.",
  "Avg CTR": "Average Click-Through Rate across all creatives.",
  "CPC": "Cost Per Click — how much each link click cost on average.",
  "Avg CPC": "Average Cost Per Click across all creatives.",
  "CPM": "Cost Per Mille — cost per 1,000 impressions. Measures how expensive it is to reach people.",
  "ROAS": "Return On Ad Spend — revenue generated per dollar spent. A 3x ROAS means $3 earned for every $1 spent.",
  "Avg ROAS": "Average Return On Ad Spend across all creatives.",
  "Blended ROAS": "Overall ROAS calculated across all creatives combined (total revenue / total spend).",
  "CPA": "Cost Per Acquisition — how much it costs to get one conversion (purchase or lead).",
  "Avg CPA": "Average Cost Per Acquisition across all creatives.",
  "Purchases": "Number of purchase conversions attributed to this ad.",
  "Leads": "Number of lead conversions attributed to this ad.",
  "Cost/Lead": "Cost per lead — total spend divided by the number of leads generated.",
  "COST/LEAD": "Cost per lead — total spend divided by the number of leads generated.",
  "Avg Cost/Lead": "Average cost per lead across all creatives.",

  // Video metrics
  "25% Watched": "Number of times the video was watched to at least 25% of its length.",
  "50% Watched": "Number of times the video was watched to at least 50% of its length.",
  "75% Watched": "Number of times the video was watched to at least 75% of its length.",
  "ThruPlay": "Number of times the video was watched to completion or for at least 15 seconds.",

  // AI analysis tags
  "Asset Type": "Type of creative asset — e.g. Graphic Design, UGC, Stock Footage, etc.",
  "Visual Format": "The visual format of the ad — e.g. Static Image, Carousel, Video, etc.",
  "Messaging Angle": "The primary persuasion angle used — e.g. Social Proof, Benefits, Urgency, etc.",
  "Hook Tactic": "How the ad grabs attention in the first few seconds — e.g. Question, Bold Claim, Statistic.",
  "Offer Type": "The type of offer or CTA — e.g. Discount, Free Trial, Limited Time, etc.",
  "Funnel Stage": "Where in the funnel this ad fits — TOF (awareness), MOF (consideration), or BOF (conversion).",

  // Funnel stages
  "TOF": "Top Of Funnel — awareness stage. Ads reaching cold audiences for the first time.",
  "MOF": "Middle Of Funnel — consideration stage. Re-engaging people who showed interest.",
  "BOF": "Bottom Of Funnel — conversion stage. Targeting warm audiences ready to buy.",

  // Dashboard
  "Active": "Ads that are currently running and spending budget.",
  "Pending analysis": "Creatives waiting to be analyzed by the AI.",
  "Analyzed": "Creatives that have been analyzed by the AI.",
  "Total creatives": "Total number of ad creatives synced from your accounts.",
  "Creatives": "Total number of ad creatives synced from your accounts.",
  "Win Rate": "Percentage of creatives scoring 70+ out of 100 in their stage.",

  // Analytics
  "Scale": "High-performing creatives worth increasing budget on.",
  "Watch": "Creatives with mixed signals or insufficient data — keep monitoring.",
  "Kill": "Underperforming creatives that should be paused to stop wasting budget.",
  "Total": "Total number of creatives in this funnel stage.",
  "Winners": "Creatives scoring 70+ that are outperforming the group.",
  "Impact": "Estimated business impact score — higher means more potential upside from acting on this.",

  // Settings
  "Campaign Goal": "Your primary optimization objective. Changes how metrics are displayed and which KPIs are prioritized.",
  "Sync Date Range": "How many days of historical ad data to pull when syncing. Larger = more data but slower syncs.",
  "Winner ROAS Threshold": "Minimum Return On Ad Spend to classify a creative as a \"winner\". Typically 2x-3x.",
  "Target CPA": "Maximum acceptable Cost Per Acquisition. Creatives above this threshold are flagged.",
  "Minimum Spend Threshold": "Minimum ad spend before a creative is included in analytics. Filters out low-data noise.",

  // Reports
  "Top Performers": "The 5 best-performing creatives sorted by your campaign goal metric.",
  "Bottom Performers": "The 5 worst-performing creatives — candidates for pausing or optimization.",

  // Campaign goals
  "Lead Gen": "Optimizing for lead generation — Cost Per Lead is the primary metric.",
  "Traffic": "Optimizing for website traffic — Click-Through Rate is the primary metric.",
  "Purchase ROAS": "Optimizing for purchase revenue — Return On Ad Spend is the primary metric.",
};

export function getTooltip(label: string): string | null {
  return GLOSSARY[label.trim()] || null;
}

/** Wrap a label with tooltip data attribute — returns JSX */
export function Tip({ label, children }: { label: string; children?: React.ReactNode }) {
  const tip = getTooltip(label);
  if (!tip) return <>{children || label}</>;
  return (
    <span className="has-tip" data-tip={tip}>
      {children || label}
    </span>
  );
}

/** Global tooltip provider — renders the floating tooltip and handles events */
export function TooltipProvider() {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const el = tooltipRef.current;
    if (!el) return;

    function show(target: HTMLElement) {
      if (!el) return;
      clearTimeout(hideTimeoutRef.current);

      // Support both data-tip (glossary) and data-tooltip (custom)
      const tip = target.dataset.tip || target.dataset.tooltip;
      if (!tip) return;

      // Set content and measure off-screen first
      el.textContent = tip;
      el.style.left = "-9999px";
      el.style.top = "-9999px";
      el.classList.add("visible");

      // Force reflow so we get accurate dimensions
      const tipRect = el.getBoundingClientRect();
      const rect = target.getBoundingClientRect();

      let left = rect.left + rect.width / 2 - tipRect.width / 2;
      let top = rect.bottom + 8;

      const pad = 12;
      if (left < pad) left = pad;
      if (left + tipRect.width > window.innerWidth - pad) {
        left = window.innerWidth - pad - tipRect.width;
      }
      if (top + tipRect.height > window.innerHeight - pad) {
        top = rect.top - tipRect.height - 8;
      }

      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
    }

    function hide() {
      hideTimeoutRef.current = setTimeout(() => {
        el?.classList.remove("visible");
      }, 80);
    }

    let currentTarget: HTMLElement | null = null;

    function onMouseOver(e: Event) {
      const target = (e.target as HTMLElement).closest(".has-tip") as HTMLElement | null;
      if (target && target !== currentTarget) {
        currentTarget = target;
        show(target);
      } else if (!target && currentTarget) {
        currentTarget = null;
        hide();
      }
    }

    function onMouseOut(e: Event) {
      const related = (e as MouseEvent).relatedTarget as HTMLElement | null;
      const stillInTip = related?.closest(".has-tip") === currentTarget;
      if (!stillInTip) {
        currentTarget = null;
        hide();
      }
    }

    function onTouchStart(e: Event) {
      const target = (e.target as HTMLElement).closest(".has-tip") as HTMLElement | null;
      if (target) {
        currentTarget = target;
        show(target);
      } else {
        currentTarget = null;
        hide();
      }
    }

    document.addEventListener("mouseover", onMouseOver);
    document.addEventListener("mouseout", onMouseOut);
    document.addEventListener("touchstart", onTouchStart, { passive: true });

    return () => {
      document.removeEventListener("mouseover", onMouseOver);
      document.removeEventListener("mouseout", onMouseOut);
      document.removeEventListener("touchstart", onTouchStart);
    };
  }, []);

  return (
    <div
      ref={tooltipRef}
      className="tooltip-popup"
      role="tooltip"
    />
  );
}
