/** @type {import('next').NextConfig} */
const nextConfig = {
  // Impede que node-ssh/ssh2 sejam bundlados pelo Webpack/Turbopack
  // (são módulos nativos Node.js, devem rodar apenas no servidor)
  serverExternalPackages: ['node-ssh', 'ssh2', 'cpu-features', 'sshcrypto'],
};

export default nextConfig;
