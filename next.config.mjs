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
  // Impede que node-ssh/ssh2 sejam bundlados pelo Webpack/Turbopack
  // (são módulos nativos Node.js, devem rodar apenas no servidor)
  serverExternalPackages: ['node-ssh', 'ssh2', 'cpu-features', 'sshcrypto'],
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,OPTIONS,PATCH,DELETE,POST,PUT" },
          {
            key: "Access-Control-Allow-Headers",
            value: "Authorization, X-SSH-Override, X-Device-Id, X-Device-Name, X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
          },
        ]
      }
    ];
  }
};

export default nextConfig;
