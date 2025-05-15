/** @type {import('next').NextConfig} */
const { withBaml } = require('@boundaryml/baml-nextjs-plugin');

const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: '127.0.0.1',
        port: '54321',
        pathname: '/storage/v1/object/sign/**',
      },
      // Example for a production Supabase URL (replace with your actual one)
      // {
      //   protocol: 'https',
      //   hostname: '*.supabase.co', // Or your specific project ref
      //   port: '',
      //   pathname: '/storage/v1/object/sign/**',
      // },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '500mb', // Increase the body size limit to 500MB for video uploads
    },
  },
  eslint: {
    ignoreDuringBuilds: true, // Temporarily ignore ESLint errors during build
  },
  typescript: {
    ignoreBuildErrors: true, // Temporarily ignore TypeScript errors during build
  },
}

module.exports = withBaml()(nextConfig)