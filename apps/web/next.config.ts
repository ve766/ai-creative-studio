import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@acs/project-schema",
    "@acs/template-schema",
    "@acs/template-library",
    "@acs/editor-core"
  ]
};

export default nextConfig;
