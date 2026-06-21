import { runSSH, apiHandler } from '@/lib/ssh';

// POST /api/backup/full — executa backup completo
export async function POST(request) {
  return apiHandler(
    async () => {
      const r1 = await runSSH('python3 ~/Automation/Apps/Backup/run_headless.py');
      const r2 = await runSSH('python3 ~/Automation/Core/Scripts/Icloud.py');
      return {
        message: 'Backup iniciado com sucesso.',
        output: [r1.stdout, r2.stdout].filter(Boolean).join('\n'),
      };
    },
    request,
    'POST /api/backup/full'
  );
}
