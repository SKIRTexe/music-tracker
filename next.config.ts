import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "coverartarchive.org",
      },
      {
        protocol: "http",
        hostname: "coverartarchive.org",
      },
    ],
  },
};

export default nextConfig;
