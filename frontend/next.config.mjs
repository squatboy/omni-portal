/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  turbopack: {
    root: import.meta.dirname,
  },
  async rewrites() {
    return [
      {
        source: '/api/collect/:path*',
        destination: `${process.env.API_URL || 'http://localhost:8080'}/api/collect/:path*`,
      },
      {
        source: '/api/health/ready',
        destination: `${process.env.API_URL || 'http://localhost:8080'}/health/ready`,
      },
    ]
  },
}

export default nextConfig
