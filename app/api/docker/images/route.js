import { runSSH, apiHandler } from '@/lib/ssh';

// GET /api/docker/images
export async function GET() {
  return apiHandler(async () => {
    const result = await runSSH("sudo docker images --format '{{json .}}'");
    const images = result.stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try { return JSON.parse(line); }
        catch { return null; }
      })
      .filter(Boolean);
    return { images };
  });
}
