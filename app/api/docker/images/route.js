import { runSSH, apiHandler } from '@/lib/ssh';

// GET /api/docker/images
export async function GET(request) {
  return apiHandler(
    async () => {
      const result = await runSSH("docker images --format '{{.Repository}}\\t{{.Tag}}\\t{{.Size}}\\t{{.ID}}'");
      if (result.code !== 0) {
        throw new Error('Falha ao consultar imagens Docker.');
      }
      const images = result.stdout
        .split('\n')
        .map((line) => line.trimEnd())
        .filter(Boolean)
        .map((line) => {
          const [Repository = '', Tag = '', Size = '', ID = ''] = line.split('\t');
          return Repository || ID ? { Repository, Tag, Size, ID } : null;
        })
        .filter(Boolean);
      return { images };
    },
    request,
    'GET /api/docker/images'
  );
}
