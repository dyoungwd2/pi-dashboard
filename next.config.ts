import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "192.168.6.121",
    "raspberrypi.local",
  ],
};

export default nextConfig;
