import type { NextConfig } from "next";
import { allowedHosts } from "@/app/lib/imageHosts";

const nextConfig: NextConfig = {
  /* config options here */
  
  images: {
    remotePatterns: allowedHosts.map((hostname) => ({
      protocol: "https",
      hostname,
    })),
  },
    
};

export default nextConfig;
