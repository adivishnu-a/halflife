import type { NextConfig } from "next";

// The Python function is served by Vercel at /api. In development it runs
// on uvicorn at port 8000: `ml/.venv/bin/uvicorn api.index:app --port 8000`.
const pythonOrigin = process.env.NODE_ENV === "development" ? "http://127.0.0.1:8000" : "";

// The page never needs to be framed, sniffed, or handed device permissions.
// A full Content Security Policy is left out on purpose: it would need a
// nonce on the inline theme script and on Vercel's injected analytics.
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  rewrites: async () => [
    { source: "/api/py/:path*", destination: pythonOrigin ? `${pythonOrigin}/api/py/:path*` : "/api/" },
  ],
  headers: async () => [{ source: "/(.*)", headers: securityHeaders }],
};

export default nextConfig;
