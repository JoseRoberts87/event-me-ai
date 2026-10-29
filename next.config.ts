import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Strands lazily imports optional peers (MCP, A2A, other providers); load it
  // from node_modules at runtime instead of bundling it.
  serverExternalPackages: ["@strands-agents/sdk"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
