import { runSSH, apiHandler } from '@/lib/ssh';

export async function POST(request) {
  return apiHandler(
    async () => {
      const body = await request.json();
      const { model, messages } = body;

      if (!model || !messages) {
        throw new Error('Model and messages are required');
      }

      const jsonPayload = JSON.stringify({
        model,
        messages,
        stream: false,
      });

      const b64Payload = Buffer.from(jsonPayload).toString('base64');
      const tempFile = `/tmp/ollama_req_${Date.now()}_${Math.random().toString(36).substring(7)}.json`;
      
      const cmd = `echo "${b64Payload}" | base64 -d > ${tempFile} && curl -s -X POST http://127.0.0.1:11434/api/chat -H "Content-Type: application/json" -d @${tempFile} ; status=$? ; rm -f ${tempFile} ; exit $status`;
      
      const result = await runSSH(cmd);
      if (result.code !== 0) {
        throw new Error(`Erro ao conectar ao Ollama no servidor: ${result.stderr || result.stdout}`);
      }

      let data;
      try {
        data = JSON.parse(result.stdout);
      } catch (e) {
        throw new Error(`Resposta inválida do Ollama: ${result.stdout}`);
      }

      return { message: data.message };
    },
    request,
    'POST /api/ia/chat'
  );
}
