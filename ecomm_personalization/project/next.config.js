/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: { unoptimized: true },
  // no floating Next.js badge in local demos / screenshots (build errors still show as an overlay)
  devIndicators: false,
  // self-contained server bundle for the Dockerfile (node .next/standalone/server.js)
  output: 'standalone',
};

module.exports = nextConfig;
