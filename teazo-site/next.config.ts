import type { NextConfig } from "next";

import { allowedHosts } from "@/app/lib/imageHosts";

const nextConfig: NextConfig = {
  /*
   * Allows other devices on the local network to access
   * Next.js development assets and endpoints.
   */
  allowedDevOrigins: ["10.0.0.142"],

  images: {
    remotePatterns: allowedHosts.map((hostname) => ({
      protocol: "https",
      hostname,
    })),
  },
};

export default nextConfig;