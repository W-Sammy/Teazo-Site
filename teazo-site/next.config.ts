import type { NextConfig } from "next";

import { allowedHosts } from "@/app/lib/imageHosts";

// Local storage images are allowed only during development.
const isDev = process.env.NODE_ENV === "development";
const r2PublicBase = process.env.R2_PUBLIC_BASE;
const r2ImagePattern = (() => {
  if (!r2PublicBase) return [];
  try {
    const url = new URL(r2PublicBase);
    return [{
      protocol: url.protocol.replace(":", "") as "http" | "https",
      hostname: url.hostname,
      port: url.port,
      pathname: "/**",
    }];
  } catch {
    return [];
  }
})();

const nextConfig: NextConfig = {
  /*
   * Allows other devices on the local network to access
   * Next.js development assets and endpoints.
   */
  allowedDevOrigins: ["10.0.0.142"],

  images: {
    remotePatterns: [
      // Keep the existing allowed HTTPS image hosts.
      ...allowedHosts.map((hostname) => ({
        protocol: "https" as const,
        hostname,
      })),
      ...r2ImagePattern,

      // Allow images served by the local storage Worker in development.
      ...(isDev
        ? [
            {
              protocol: "http" as const,
              hostname: "127.0.0.1",
              port: "8787",
              pathname: "/media/**",
            },
          ]
        : []),
    ],

    // Keep local-IP image optimization disabled outside development.
    dangerouslyAllowLocalIP: isDev,
  },
};

export default nextConfig;
