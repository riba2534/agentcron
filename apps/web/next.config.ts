import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: false,
  },
  // workspace 包源码直接被 webpack 处理（type:module + ts-as-source 模式）
  transpilePackages: [
    '@cct/db',
    '@cct/shared',
    '@cct/secrets',
    '@cct/scheduler',
    '@cct/claude-cli',
    '@cct/prompt-safe',
  ],
  serverExternalPackages: ['@prisma/client', 'bcryptjs'],
  webpack(config) {
    // Allow `.js` 后缀解析到 `.ts/.tsx`（NodeNext 写法在 packages/* 中通用）
    config.resolve = config.resolve ?? {};
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
      '.cjs': ['.cts', '.cjs'],
    };
    return config;
  },
};

export default nextConfig;
