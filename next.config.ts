import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Next injects small inline bootstrap scripts without a nonce, so scripts need 'unsafe-inline'.
// React uses eval for better error stacks in development only. Thumbnails come from whichever
// social network a post came from, so images are allowed from any https host.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "connect-src 'self'",
  "frame-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  // A private tool: keep every page out of search results (robots.txt alone doesn't do that).
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      // The rendered digest quotes post text and links: no scripts at all, and sandboxed. Listed
      // last so it replaces the site-wide policy for this path (the route sets the same header).
      {
        source: "/api/profiles/:id/digest",
        headers: [{ key: "Content-Security-Policy", value: "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; sandbox" }],
      },
    ];
  },
};

export default nextConfig;
