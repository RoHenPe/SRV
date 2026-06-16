import { runSSH, apiHandler } from '@/lib/ssh';

export async function POST() {
  return apiHandler(async () => {
    const result = await runSSH('sudo reboot');
    return { message: 'Servidor está reiniciando...', output: result.stdout };
  });
}
