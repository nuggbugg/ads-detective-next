import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import ConvexClientProvider from "./ConvexClientProvider";
import { ToastProvider } from "@/components/ui/Toast";
import TopBar from "@/components/layout/TopBar";
import "./globals.css";

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: "Ads Detective",
  description: "Meta Ads Creative Analytics — AI-powered ad performance insights",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <ConvexClientProvider>
          <ToastProvider>
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
          </ToastProvider>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
