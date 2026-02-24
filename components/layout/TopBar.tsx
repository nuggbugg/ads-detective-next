"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";

const navItems = [
  {
    tab: "dashboard",
    label: "Dashboard",
    href: "/dashboard",
    icon: (
      <svg className="nav-tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>
      </svg>
    ),
    position: "left" as const,
  },
  {
    tab: "creatives",
    label: "Creatives",
    href: "/creatives",
    icon: (
      <svg className="nav-tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>
      </svg>
    ),
    position: "left" as const,
  },
  {
    tab: "analytics",
    label: "Analytics",
    href: "/analytics",
    icon: (
      <svg className="nav-tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>
      </svg>
    ),
    position: "left" as const,
  },
  {
    tab: "reports",
    label: "Reports",
    href: "/reports",
    icon: (
      <svg className="nav-tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
    ),
    position: "left" as const,
  },
  {
    tab: "accounts",
    label: "Accounts",
    href: "/accounts",
    icon: (
      <svg className="nav-tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>
      </svg>
    ),
    position: "right" as const,
  },
  {
    tab: "settings",
    label: "Settings",
    href: "/settings",
    icon: (
      <svg className="nav-tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09"/>
      </svg>
    ),
    position: "right" as const,
  },
];

export default function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { signOut } = useAuthActions();

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/" || pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  const leftItems = navItems.filter((n) => n.position === "left");
  const rightItems = navItems.filter((n) => n.position === "right");

  return (
    <>
      {/* Desktop Top Bar */}
      <header className="topbar">
        <div className="topbar-inner">
          <div className="topbar-left">
            <Link href="/dashboard" className="logo">
              <div className="logo-mark">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
                </svg>
              </div>
              <span className="logo-text">Ads Detective</span>
            </Link>
            <nav className="topbar-nav">
              {leftItems.map((item) => (
                <Link
                  key={item.tab}
                  href={item.href}
                  className={`nav-tab ${isActive(item.href) ? "active" : ""}`}
                >
                  {item.icon}
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="topbar-right">
            {rightItems.map((item) => (
              <Link
                key={item.tab}
                href={item.href}
                className={`nav-tab ${isActive(item.href) ? "active" : ""}`}
              >
                {item.icon}
                {item.label}
              </Link>
            ))}
            <button
              className="nav-tab sign-out-btn"
              onClick={() => { void signOut().then(() => router.push("/login")); }}
              title="Sign out"
            >
              <svg className="nav-tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Header */}
      <header className="mobile-header" id="mobile-header">
        <button
          className={`hamburger ${drawerOpen ? "open" : ""}`}
          onClick={() => setDrawerOpen(!drawerOpen)}
          aria-label="Toggle menu"
        >
          <span></span><span></span><span></span>
        </button>
        <Link href="/dashboard" className="logo logo-mobile">
          <div className="logo-mark">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
            </svg>
          </div>
          <span className="logo-text">Ads Detective</span>
        </Link>
      </header>

      {/* Mobile Drawer */}
      <div className={`mobile-drawer ${drawerOpen ? "open" : ""}`} id="mobile-drawer">
        <nav className="mobile-drawer-nav">
          {navItems.map((item, i) => (
            <span key={item.tab}>
              {i === 4 && <div className="mobile-nav-divider" />}
              <Link
                href={item.href}
                className={`mobile-nav-item ${isActive(item.href) ? "active" : ""}`}
                onClick={() => setDrawerOpen(false)}
              >
                {item.label}
              </Link>
            </span>
          ))}
        </nav>
      </div>
      {drawerOpen && (
        <div
          className="mobile-overlay visible"
          onClick={() => setDrawerOpen(false)}
        />
      )}
    </>
  );
}
