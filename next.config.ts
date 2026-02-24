import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow Meta CDN images and Convex storage
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.fbcdn.net" },
      { protocol: "https", hostname: "**.convex.cloud" },
    ],
  },
};

export default nextConfig;
