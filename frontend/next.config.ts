import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
    // Every page sits behind the login gate and loads its data in the browser, so pages can't
    // render instantly from a prerendered shell. Only check pages that ask for it (export const instant).
    instantInsights: { validationLevel: "manual-warning" },
  },
  cacheComponents: true,
  partialPrefetching: true,
  // Deployed: the browser calls /api/... on the website itself and it's forwarded to the backend
  // (BACKEND_URL, e.g. https://jobpulse-api.onrender.com). Locally it defaults to the backend on port 4000.
  async rewrites() {
    const backend = (process.env.BACKEND_URL ?? "http://localhost:4000").replace(/\/+$/, "");
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
  // Security headers (from the Next.js PWA guide). The service worker must never be cached,
  // otherwise a fixed sw.js would take days to reach your phone.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
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
