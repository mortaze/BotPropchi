/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { domains: ["api.dicebear.com"] },
  env: { NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL },
};
module.exports = nextConfig;
