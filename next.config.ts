import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the ngrok tunnel host to access dev resources (HMR, etc.).
  allowedDevOrigins: ["pulse.chanlabs.dev", "100.110.181.84"],
};  

export default nextConfig;
