import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.e2b.app", "localhost:3000"],
  // The social card route renders with the self-hosted woff files.
  outputFileTracingIncludes: {
    "/api/og": ["./public/fonts/**"],
  },
};

export default nextConfig;
