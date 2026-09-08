import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Uploaded photos are sent as multipart bodies; allow room for a few images.
    serverActions: { bodySizeLimit: "12mb" },
  },
  // The checklists that ship with the app are read from disk at runtime. Next
  // only packages what it can see being imported, so the folder has to be named
  // here or it is left behind when the app is deployed.
  outputFileTracingIncludes: {
    "/**": ["./checklists/*.csv"],
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
