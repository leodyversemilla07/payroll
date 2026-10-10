import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@workspace/ui",
    "@workspace/payroll-engine",
    "@workspace/db",
    "@workspace/api",
  ],
  async redirects() {
    return [
      {
        source: "/overview",
        destination: "/dashboard",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
