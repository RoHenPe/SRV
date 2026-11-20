import path from 'path';

if (
  process.env.NEXT_ADAPTER_PATH &&
  !process.env.NEXT_ADAPTER_PATH.endsWith('next-compat-adapter.mjs')
) {
  process.env.__ORIG_VERCEL_ADAPTER_PATH = process.env.NEXT_ADAPTER_PATH;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  adapterPath: path.resolve(process.cwd(), 'scripts/next-compat-adapter.mjs'),
  serverExternalPackages: ['node-ssh', 'ssh2', 'cpu-features', 'sshcrypto'],
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Cache-Control', value: 'no-store' },
          { key: 'Access-Control-Allow-Origin', value: 'https://srvdash.vercel.app' },
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,OPTIONS,PATCH,DELETE,POST,PUT' },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Authorization, X-Device-Id, X-Device-Name, Content-Type, Accept',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
