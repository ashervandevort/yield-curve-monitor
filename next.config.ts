import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Enable standalone output for VPS deployment
  output: 'standalone',
}

export default nextConfig
