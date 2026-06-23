/** @type {import('next').NextConfig} */
const nextConfig = {
  // Impede que node-ssh/ssh2 sejam bundlados pelo Webpack/Turbopack
  // (são módulos nativos Node.js, devem rodar apenas no servidor)
  serverExternalPackages: ['node-ssh', 'ssh2', 'cpu-features', 'sshcrypto'],
  async headers() {
    return [
      {
        // Libera as permissões de acesso cruzado para todas as rotas da sua API
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,OPTIONS,PATCH,DELETE,POST,PUT" },
          { key: "Access-Control-Allow-Headers", value: "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version" },
        ]
      }
    ]
  }
};

export default nextConfig;
