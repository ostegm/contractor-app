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
      bodySizeLimit: '10mb', // Increase the body size limit to 10MB
    },
  },
}

module.exports = withBaml()(nextConfig)