/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@stablenet/core', '@stablenet/plugin-stealth'],

  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      // The connector barrel references optional peers. This app only enables
      // injected wallets and the StableNet connector.
      '@base-org/account': false,
    }
    config.resolve.fallback = {
      ...config.resolve.fallback,
      '@react-native-async-storage/async-storage': false,
    }
    return config
  },
}

module.exports = nextConfig
