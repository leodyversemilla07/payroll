import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@workspace/ui",
    "@workspace/payroll-engine",
    "@workspace/db",
    "@workspace/api",
  ],
};

export default nextConfig;
