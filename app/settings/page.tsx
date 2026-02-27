"use client";

import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState, useEffect } from "react";
import { PageLoader } from "@/components/ui/Loader";
import { useToast } from "@/components/ui/Toast";

export default function SettingsPage() {
  const settings = useQuery(api.settings.getAll);
  const currencyData = useQuery(api.settings.getCurrency);
  const setMany = useMutation(api.settings.setMany);
  const testMeta = useAction(api.settings.testMetaConnection);
  const seedDefaults = useMutation(api.settings.seedDefaults);
  const toast = useToast();

  const currencySymbol = currencyData?.symbol || "$";

  const [metaToken, setMetaToken] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [campaignGoal, setCampaignGoal] = useState("roas");
  const [dateRange, setDateRange] = useState("30");
  const [roasThreshold, setRoasThreshold] = useState("2.0");
  const [cpaThreshold, setCpaThreshold] = useState("30");
  const [spendThreshold, setSpendThreshold] = useState("50");
  const [syncFrequency, setSyncFrequency] = useState("every_6h");

  const connectShopify = useAction(api.shopify.connect);
  const disconnectShopify = useAction(api.shopify.disconnect);

  const [metaTesting, setMetaTesting] = useState(false);
  const [metaTestResult, setMetaTestResult] = useState<{
    type: "success" | "error";
    message: string;
    detail?: string;
  } | null>(null);
  const [savingGemini, setSavingGemini] = useState(false);
  const [savingParams, setSavingParams] = useState(false);
  const [seeded, setSeeded] = useState(false);
  const [shopifyToken, setShopifyToken] = useState("");
  const [shopifyConnecting, setShopifyConnecting] = useState(false);
  const [shopifyDisconnecting, setShopifyDisconnecting] = useState(false);
  const [shopifyResult, setShopifyResult] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Seed defaults once
  useEffect(() => {
    if (settings && !seeded) {
      if (Object.keys(settings).filter((k) => !k.startsWith("_")).length === 0) {
        seedDefaults({}).then(() => setSeeded(true));
      } else {
        setSeeded(true);
      }
    }
  }, [settings, seeded, seedDefaults]);

  // Populate form from settings
  useEffect(() => {
    if (settings) {
      if (settings._has_meta_token && typeof settings.meta_access_token === "string") {
        setMetaToken(settings.meta_access_token);
      }
      if (settings._has_gemini_key && typeof settings.gemini_api_key === "string") {
        setGeminiKey(settings.gemini_api_key);
      }
      if (typeof settings.campaign_goal === "string") setCampaignGoal(settings.campaign_goal);
      if (typeof settings.date_range_days === "string") setDateRange(settings.date_range_days);
      if (typeof settings.winner_roas_threshold === "string") setRoasThreshold(settings.winner_roas_threshold);
      if (typeof settings.winner_cpa_threshold === "string") setCpaThreshold(settings.winner_cpa_threshold);
      if (typeof settings.iteration_spend_threshold === "string") setSpendThreshold(settings.iteration_spend_threshold);
      if (typeof settings.sync_frequency === "string") setSyncFrequency(settings.sync_frequency);
      if (settings._has_shopify_token && typeof settings.shopify_access_token === "string") {
        setShopifyToken(settings.shopify_access_token);
      }
    }
  }, [settings]);

  if (!settings) return <PageLoader />;

  const handleSaveMeta = async () => {
    const token = metaToken.trim();
    if (!token || token.includes("****")) {
      toast.error("Please enter a Meta access token");
      return;
    }

    setMetaTesting(true);
    setMetaTestResult(null);

    try {
      const result = await testMeta({ token });
      await setMany({ settings: { meta_access_token: token } });

      setMetaTestResult({
        type: "success",
        message: `Connected as ${result.user.name}`,
        detail: `${result.accounts.length} ad account${result.accounts.length !== 1 ? "s" : ""} accessible`,
      });
      toast.success("Meta connected successfully");
    } catch (err) {
      setMetaTestResult({
        type: "error",
        message: "Connection failed",
        detail: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setMetaTesting(false);
    }
  };

  const handleSaveGemini = async () => {
    const key = geminiKey.trim();
    if (!key || key.includes("****")) {
      toast.error("Please enter a Gemini API key");
      return;
    }

    setSavingGemini(true);
    try {
      await setMany({ settings: { gemini_api_key: key } });
      toast.success("Gemini API key saved");
    } catch {
      toast.error("Failed to save key");
    } finally {
      setSavingGemini(false);
    }
  };

  const handleConnectShopify = async () => {
    const token = shopifyToken.trim();
    if (!token || token.includes("****")) {
      toast.error("Please enter a Shopify access token");
      return;
    }

    setShopifyConnecting(true);
    setShopifyResult(null);
    try {
      const result = await connectShopify({ token });
      setShopifyResult({
        type: "success",
        message: `Connected to ${result.shop_name}`,
      });
      toast.success("Shopify connected successfully");
    } catch (err) {
      setShopifyResult({
        type: "error",
        message: err instanceof Error ? err.message : "Connection failed",
      });
    } finally {
      setShopifyConnecting(false);
    }
  };

  const handleDisconnectShopify = async () => {
    setShopifyDisconnecting(true);
    try {
      await disconnectShopify();
      setShopifyToken("");
      setShopifyResult(null);
      toast.success("Shopify disconnected");
    } catch {
      toast.error("Failed to disconnect Shopify");
    } finally {
      setShopifyDisconnecting(false);
    }
  };

  const handleSaveParams = async () => {
    setSavingParams(true);
    try {
      await setMany({
        settings: {
          campaign_goal: campaignGoal,
          date_range_days: dateRange,
          sync_frequency: syncFrequency,
          winner_roas_threshold: roasThreshold,
          winner_cpa_threshold: cpaThreshold,
          iteration_spend_threshold: spendThreshold,
        },
      });
      toast.success("Parameters saved");
    } catch {
      toast.error("Failed to save parameters");
    } finally {
      setSavingParams(false);
    }
  };

  return (
    <div className="settings-page page-content">
      <div className="page-header">
        <h2>Settings</h2>
        <p className="page-subtitle">
          Connect your accounts and configure analysis parameters
        </p>
      </div>

      <div className="settings-grid">
        {/* Meta Connection */}
        <div className="settings-card">
          <div className="card-header">
            <h3>Meta Ads Connection</h3>
            <div
              className={`connection-status ${
                settings._has_meta_token ? "status-connected" : "status-disconnected"
              }`}
            >
              {settings._has_meta_token ? "Connected" : "Not Connected"}
            </div>
          </div>
          <p className="helper-text">
            Paste your Meta Marketing API access token. Use a long-lived token
            (60 days) or a system user token for uninterrupted access.
          </p>
          <div className="input-group">
            <input
              type="password"
              className="input"
              placeholder="Enter Meta access token"
              value={metaToken}
              onChange={(e) => setMetaToken(e.target.value)}
            />
            <button
              className="btn btn-primary"
              onClick={handleSaveMeta}
              disabled={metaTesting}
            >
              {metaTesting ? "Connecting..." : "Save & Connect"}
            </button>
          </div>
          {metaTestResult && (
            <div
              className={`test-result ${
                metaTestResult.type === "success" ? "test-success" : "test-error"
              }`}
            >
              <strong>{metaTestResult.message}</strong>
              {metaTestResult.detail && <span>{metaTestResult.detail}</span>}
            </div>
          )}
        </div>

        {/* Gemini Key */}
        <div className="settings-card">
          <div className="card-header">
            <h3>Gemini AI Key</h3>
            <div
              className={`connection-status ${
                settings._has_gemini_key ? "status-connected" : "status-disconnected"
              }`}
            >
              {settings._has_gemini_key ? "Configured" : "Not Set"}
            </div>
          </div>
          <p className="helper-text">
            Your Google Gemini API key powers the creative analysis. Get one free
            at Google AI Studio.
          </p>
          <div className="input-group">
            <input
              type="password"
              className="input"
              placeholder="Enter Gemini API key"
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
            />
            <button
              className="btn btn-primary"
              onClick={handleSaveGemini}
              disabled={savingGemini}
            >
              {savingGemini ? "Saving..." : "Save Key"}
            </button>
          </div>
        </div>

        {/* Shopify Connection */}
        <div className="settings-card">
          <div className="card-header">
            <h3>Shopify Connection</h3>
            <div
              className={`connection-status ${
                settings._has_shopify_token ? "status-connected" : "status-disconnected"
              }`}
            >
              {settings._has_shopify_token ? "Connected" : "Not Connected"}
            </div>
          </div>
          <p className="helper-text">
            Paste your Shopify Admin API access token to track monthly sales on
            the dashboard. Create a custom app in your Shopify admin to get one.
          </p>
          <div className="input-group">
            <input
              type="password"
              className="input"
              placeholder="Enter Shopify access token"
              value={shopifyToken}
              onChange={(e) => setShopifyToken(e.target.value)}
            />
            {settings._has_shopify_token ? (
              <button
                className="btn btn-secondary"
                onClick={handleDisconnectShopify}
                disabled={shopifyDisconnecting}
              >
                {shopifyDisconnecting ? "Disconnecting..." : "Disconnect"}
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={handleConnectShopify}
                disabled={shopifyConnecting}
              >
                {shopifyConnecting ? "Connecting..." : "Save & Connect"}
              </button>
            )}
          </div>
          {shopifyResult && (
            <div
              className={`test-result ${
                shopifyResult.type === "success" ? "test-success" : "test-error"
              }`}
            >
              <strong>{shopifyResult.message}</strong>
            </div>
          )}
        </div>

        {/* Analysis Parameters */}
        <div className="settings-card">
          <div className="card-header">
            <h3>Analysis Parameters</h3>
          </div>
          <p className="helper-text">
            These thresholds control how creatives are scored and categorized.
          </p>

          <div className="settings-form">
            <div className="form-row">
              <label className="form-label">
                Campaign Goal
                <span className="label-hint">
                  How your campaigns are optimized — determines which metrics
                  matter
                </span>
              </label>
              <select
                className="input input-sm"
                value={campaignGoal}
                onChange={(e) => setCampaignGoal(e.target.value)}
              >
                <option value="roas">Purchase ROAS</option>
                <option value="lead_gen">Lead Generation (CPA)</option>
                <option value="traffic">Traffic (CTR)</option>
              </select>
            </div>

            <div className="form-row">
              <label className="form-label">
                Sync Date Range
                <span className="label-hint">
                  Days of data to pull on each sync
                </span>
              </label>
              <div className="input-with-unit">
                <input
                  type="number"
                  className="input input-sm"
                  value={dateRange}
                  onChange={(e) => setDateRange(e.target.value)}
                  min="1"
                  max="180"
                />
                <span className="unit">days</span>
              </div>
            </div>

            <div className="form-row">
              <label className="form-label">
                Sync Frequency
                <span className="label-hint">
                  How often to automatically sync ad data from Meta
                </span>
              </label>
              <select
                className="input input-sm"
                value={syncFrequency}
                onChange={(e) => setSyncFrequency(e.target.value)}
              >
                <option value="manual">Manual only</option>
                <option value="every_6h">Every 6 hours</option>
                <option value="every_12h">Every 12 hours</option>
                <option value="daily">Once daily</option>
              </select>
            </div>

            {(campaignGoal === "roas" || !campaignGoal) && (
              <div className="form-row">
                <label className="form-label">
                  Winner ROAS Threshold
                  <span className="label-hint">
                    Minimum ROAS to consider a creative a &quot;winner&quot;
                  </span>
                </label>
                <div className="input-with-unit">
                  <input
                    type="number"
                    className="input input-sm"
                    value={roasThreshold}
                    onChange={(e) => setRoasThreshold(e.target.value)}
                    min="0"
                    step="0.1"
                  />
                  <span className="unit">x</span>
                </div>
              </div>
            )}

            {campaignGoal === "lead_gen" && (
              <div className="form-row">
                <label className="form-label">
                  Target CPA
                  <span className="label-hint">
                    Maximum cost per lead/acquisition — creatives above this are
                    flagged
                  </span>
                </label>
                <div className="input-with-unit">
                  <input
                    type="number"
                    className="input input-sm"
                    value={cpaThreshold}
                    onChange={(e) => setCpaThreshold(e.target.value)}
                    min="0"
                    step="1"
                  />
                  <span className="unit">{currencySymbol}</span>
                </div>
              </div>
            )}

            <div className="form-row">
              <label className="form-label">
                Minimum Spend Threshold
                <span className="label-hint">
                  Creatives below this spend are excluded from recommendations
                </span>
              </label>
              <div className="input-with-unit">
                <input
                  type="number"
                  className="input input-sm"
                  value={spendThreshold}
                  onChange={(e) => setSpendThreshold(e.target.value)}
                  min="0"
                  step="10"
                />
                <span className="unit">{currencySymbol}</span>
              </div>
            </div>

            <button
              className="btn btn-primary"
              onClick={handleSaveParams}
              disabled={savingParams}
            >
              {savingParams ? "Saving..." : "Save Parameters"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
