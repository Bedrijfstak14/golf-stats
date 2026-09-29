import type { NextConfig } from "next";

// Domeinen achter een proxy/tunnel die server actions mogen aanroepen (komma-gescheiden, bij build)
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim().replace(/^https?:\/\//, "").replace(/\/$/, ""))
  .filter(Boolean);

const dev = process.env.NODE_ENV !== "production";

// Alles komt van de eigen origin: Gemini wordt alleen server-side aangeroepen, er zijn geen externe scripts of fonts.
// Next.js zet inline scripts voor hydration, vandaar 'unsafe-inline'; de dev-server heeft daarnaast eval en websockets nodig.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self'${dev ? " ws: wss:" : ""}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Browsers negeren HSTS over http, dus plain http op het LAN blijft werken
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  experimental: {
    serverActions: { bodySizeLimit: "20mb", allowedOrigins },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
