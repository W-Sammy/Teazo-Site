import type { NextConfig } from "next";

import { allowedHosts } from "@/app/lib/imageHosts";
import { resolveSquareEnvironment } from "./app/lib/square-environment";

// Fail before accepting requests, even if no Square route has loaded yet.
resolveSquareEnvironment(process.env.SQUARE_ENVIRONMENT);

// Local storage images are allowed only during development.
const isDev = process.env.NODE_ENV === "development";
// Comma-separated hostnames for local tunnels; no scheme or port.
const extraDevOrigins = (process.env.DEV_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((hostname) => hostname.trim())
  .filter(Boolean);
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

// Files in public/ keep the same name when replaced, so browsers keep them for
// a day and refresh them in the background for a week after that (TZ-515).
const PUBLIC_ASSET_CACHE = "public, max-age=86400, stale-while-revalidate=604800";

const nextConfig: NextConfig = {
  async headers() {
    return [
      "/TEAZO_logo.svg",
      "/pink_scribble.svg",
      "/social_icons/:path*",
      "/carousel_images/:path*",
      "/menu_items/:path*",
    ].map((source) => ({
      source,
      headers: [{ key: "Cache-Control", value: PUBLIC_ASSET_CACHE }],
    }));
  },

  /*
   * Allows configured tunnels and other devices on the local network to access
   * Next.js development assets and endpoints.
   */
  allowedDevOrigins: ["10.0.0.142", ...extraDevOrigins],

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
