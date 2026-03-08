/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["pg"]
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push("pg-native");
    } else {
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),
        "pg-native": false
      };
    }
    return config;
  }
};

export default nextConfig;
