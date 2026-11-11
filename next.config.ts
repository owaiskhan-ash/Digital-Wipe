import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["*.e2b.app", "localhost:3000"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.googleusercontent.com",
      },
    ],
  },
  // The social card route renders with the self-hosted woff files.
  outputFileTracingIncludes: {
    "/api/og": ["./public/fonts/**"],
  },
};

export default nextConfig;
