import { apiHandler } from '@/lib/ssh';

const SAFE_DIAGNOSTIC_KEYS = [
  'NODE_ENV',
  'VERCEL',
  'VERCEL_ENV',
  'VERCEL_REGION',
  'LOG_LEVEL',
  'RATE_LIMIT_ENABLED',
  'RATE_LIMIT_REQUESTS_PER_MIN',
  'SSH_PORT',
];

export async function GET(request) {
  return apiHandler(
    async () => {
      const env = {};
      for (const key of SAFE_DIAGNOSTIC_KEYS) {
        if (process.env[key] !== undefined) {
          env[key] = process.env[key];
        }
      }
      env.CONFIGURED_SECRETS = {
        API_KEY: Boolean(process.env.API_KEY),
        SSH_HOST: Boolean(process.env.SSH_HOST),
        SSH_HOST_VPN: Boolean(process.env.SSH_HOST_VPN),
        SSH_PASSWORD: Boolean(process.env.SSH_PASSWORD),
        SSH_PRIVATE_KEY_B64: Boolean(process.env.SSH_PRIVATE_KEY_B64),
        NGROK_AUTHTOKEN: Boolean(process.env.NGROK_AUTHTOKEN),
      };
      return { env };
    },
    request,
    'GET /api/debug-env'
  );
}
