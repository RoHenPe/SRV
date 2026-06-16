import { runSSH, apiHandler } from '@/lib/ssh';

export async function POST() {
  return apiHandler(async () => {
    const result = await runSSH('sudo poweroff');
    return { message: 'Servidor está desligando...', output: result.stdout };
  });
}
