import type { NextConfig } from "next";

import { allowedHosts } from "@/app/lib/imageHosts";

const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  /*
   * Allows other devices on the local network to access
   * Next.js development assets and endpoints.
   */
  allowedDevOrigins: ["10.0.0.142"],

  images: {
    remotePatterns: [
      ...allowedHosts.map((hostname) => ({
        protocol: "https" as const,
        hostname,
      })),
      /*
       * Local development only: uploaded media is served by the proxy Worker
       * running on your machine. See docs/DEV-GUIDE.md.
       */
      ...(isDev
        ? [{ protocol: "http" as const, hostname: "127.0.0.1", port: "8787", pathname: "/media/**" }]
        : []),
    ],
    /*
     * Next.js 16 refuses to optimize images from local IP addresses by default,
     * as an SSRF guard for servers. A laptop is not that server, so this is
     * relaxed in development only. Production keeps the default.
     */
    dangerouslyAllowLocalIP: isDev,
  },
};

export default nextConfig;
