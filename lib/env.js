const REQUIRED_VARS = [
  'API_KEY',
  'SSH_HOST',
  'SSH_USER',
];

const OPTIONAL_VARS = [
  'SSH_HOST_VPN',
  'SSH_PORT',
  'SSH_PRIVATE_KEY_B64',
  'SSH_PASSWORD',
  'NEXT_PUBLIC_SSH_HOST',
  'LOG_LEVEL',
  'RATE_LIMIT_ENABLED',
  'RATE_LIMIT_REQUESTS_PER_MIN',
];

export function validateEnv() {
  const missing = REQUIRED_VARS.filter(v => !process.env[v]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const warnings = [];

  if (!process.env.SSH_PRIVATE_KEY_B64 && !process.env.SSH_PASSWORD) {
    warnings.push('SSH_PRIVATE_KEY_B64 and SSH_PASSWORD are both unset. At least one is required.');
  }

  if (warnings.length > 0) {
    console.warn('[Env Validation]', warnings.join(' '));
  }

  console.log('[Env Validation] ✓ All required variables are set');
  return true;
}

export const ENV_CONFIG = {
  apiKey: process.env.API_KEY,
  sshHost: process.env.SSH_HOST,
  sshHostVpn: process.env.SSH_HOST_VPN,
  sshUser: process.env.SSH_USER,
  sshPort: parseInt(process.env.SSH_PORT || '22', 10),
  logLevel: process.env.LOG_LEVEL || 'info',
  rateLimitEnabled: process.env.RATE_LIMIT_ENABLED !== 'false',
  rateLimitRequestsPerMin: parseInt(process.env.RATE_LIMIT_REQUESTS_PER_MIN || '10', 10),
};
