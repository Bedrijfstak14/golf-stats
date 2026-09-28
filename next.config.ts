import type { NextConfig } from "next";

// Domeinen achter een proxy/tunnel die server actions mogen aanroepen (komma-gescheiden, bij build)
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim().replace(/^https?:\/\//, "").replace(/\/$/, ""))
  .filter(Boolean);

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    serverActions: { bodySizeLimit: "20mb", allowedOrigins },
  },
};

export default nextConfig;
