/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ["api.dicebear.com"],
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "**" },
    ],
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_DEBUG_MINI_APP: process.env.DEBUG_MINI_APP || process.env.NEXT_PUBLIC_DEBUG_MINI_APP || "false",
  },
};
module.exports = nextConfig;
