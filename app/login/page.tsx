"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    try {
      await signIn("password", formData);
      router.push("/dashboard");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Authentication failed"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
            </svg>
          </div>
          <h1 className="login-title">Ads Detective</h1>
          <p className="login-subtitle">
            {flow === "signIn" ? "Sign in to your account" : "Create your account"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              required
              autoComplete="email"
              className="input"
            />
          </div>
          <div className="login-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              placeholder="Min 8 characters"
              required
              minLength={8}
              autoComplete={flow === "signIn" ? "current-password" : "new-password"}
              className="input"
            />
          </div>
          <input name="flow" type="hidden" value={flow} />

          {error && <p className="login-error">{error}</p>}

          <button type="submit" className="btn btn-primary login-submit" disabled={loading}>
            {loading ? "Loading..." : flow === "signIn" ? "Sign in" : "Create account"}
          </button>
        </form>

        <div className="login-footer">
          <button
            type="button"
            className="login-toggle"
            onClick={() => {
              setFlow(flow === "signIn" ? "signUp" : "signIn");
              setError(null);
            }}
          >
            {flow === "signIn"
              ? "Don't have an account? Sign up"
              : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}
