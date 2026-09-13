import type { NextConfig } from "next";

// The Python function is served by Vercel at /api. In development it runs
// on uvicorn at port 8000: `ml/.venv/bin/uvicorn api.index:app --port 8000`.
const pythonOrigin = process.env.NODE_ENV === "development" ? "http://127.0.0.1:8000" : "";

const nextConfig: NextConfig = {
  rewrites: async () => [
    { source: "/api/py/:path*", destination: pythonOrigin ? `${pythonOrigin}/api/py/:path*` : "/api/" },
  ],
};

export default nextConfig;
