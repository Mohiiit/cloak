/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // Required for starknet.js BigInt support
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };
    return config;
  },
};

module.exports = nextConfig;
