import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import ConvexClientProvider from "./ConvexClientProvider";
import { ToastProvider } from "@/components/ui/Toast";
import { TooltipProvider } from "@/components/ui/Tooltip";
import AuthenticatedLayout from "@/components/layout/AuthenticatedLayout";
import "./globals.css";

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ads Detective",
  description: "Meta Ads Creative Analytics — AI-powered ad performance insights",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ConvexAuthNextjsServerProvider>
      <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
        <body>
          <ConvexClientProvider>
            <ToastProvider>
              <AuthenticatedLayout>
                {children}
              </AuthenticatedLayout>
              <TooltipProvider />
            </ToastProvider>
          </ConvexClientProvider>
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  );
}
