"use client";

import { usePathname } from "next/navigation";
import TopBar from "./TopBar";

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/login";

  if (isLogin) {
    return <>{children}</>;
  }

  return (
    <div id="app">
      <TopBar />
      <main className="app-main">
        <div className="main-container">
          <div className="main-inner">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
