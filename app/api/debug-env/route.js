export async function GET() {
  const env = {};
  for (const key in process.env) {
    const upperKey = key.toUpperCase();
    if (
      upperKey.includes('KEY') ||
      upperKey.includes('PASSWORD') ||
      upperKey.includes('SECRET') ||
      upperKey.includes('TOKEN') ||
      upperKey.includes('AUTH')
    ) {
      env[key] = '***';
    } else {
      env[key] = process.env[key];
    }
  }
  return Response.json(env);
}
