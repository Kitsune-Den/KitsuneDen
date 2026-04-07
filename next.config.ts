import type { NextConfig } from "next";
import pkg from "./package.json" with { type: "json" };

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  serverExternalPackages: ["better-sqlite3"],
  env: {
    APP_VERSION: pkg.version,
  },
};

export default nextConfig;
