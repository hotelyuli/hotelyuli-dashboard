import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Browsers must re-check sw.js on every visit so a bumped CACHE version rolls out.
  async headers() {
    return [{ source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] }];
  },
  experimental: {
    typedEnv: true
  }
};

export default nextConfig;
