import { apiHandler } from '@/lib/ssh';

export async function POST(request) {
  return apiHandler(
    async () => {
      const body = await request.json();
      const { model, messages } = body;

      if (!model || !messages) {
        throw new Error('Model and messages are required');
      }

      const response = await fetch('http://127.0.0.1:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          stream: false,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Ollama API error: ${errText}`);
      }

      const data = await response.json();
      return { message: data.message };
    },
    request,
    'POST /api/ia/chat'
  );
}
