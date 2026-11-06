import type { NextConfig } from 'next';
import path from 'node:path';
const config: NextConfig = {
  outputFileTracingRoot: path.resolve(process.cwd(), '../..'),
  transpilePackages: ['@greenci/core', '@greenci/deck-protocol'],
  experimental: { cpus: 2 },
  webpack(config) {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};
export default config;
