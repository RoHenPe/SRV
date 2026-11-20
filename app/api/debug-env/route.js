import { apiHandler } from '@/lib/ssh';

export async function GET(request) {
  return apiHandler(
    async () => {
      const env = {
        PLATFORM: process.env.VERCEL ? 'cloud' : 'local',
        CONFIGURED_SECRETS: {
          AUTH_API: Boolean(process.env.API_KEY),
          BRIDGE: Boolean(process.env.BRIDGE_URL || process.env.BRIDGE_SECRET),
          SSH_HOST: Boolean(process.env.SSH_HOST),
          SSH_VPN: Boolean(process.env.SSH_HOST_VPN),
          SSH_CRED: Boolean(process.env.SSH_PASSWORD || process.env.SSH_PRIVATE_KEY_B64),
          AI_GATEWAY: Boolean(process.env.AI_GATEWAY_API_KEY),
          WOL: Boolean(process.env.SRV_MAC),
        },
      };
      return { env };
    },
    request,
    'GET /api/debug-env',
    { roles: ['admin'] }
  );
}
