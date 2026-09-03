import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Uploaded photos are sent as multipart bodies; allow room for a few images.
    serverActions: { bodySizeLimit: "12mb" },
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
