import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  allowedDevOrigins: ["127.0.0.1"],
  experimental: {
    // Dev hydration waits for the React debug channel to close over the HMR
    // websocket. If that socket never connects, hydrateRoot never runs and the
    // assistant buttons stay as inert server HTML. Stack traces in the dev
    // overlay are enough without that channel.
    reactDebugChannel: false,
  },
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
