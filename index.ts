import { generateText } from 'ai';
import dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

async function main() {
  try {
    const { text } = await generateText({
      model: 'moonshotai/kimi-k3',
      prompt: 'Invent a new holiday and describe its traditions.',
    });

    console.log(text);
  } catch (error) {
    console.error('Error executing model request:', error);
    process.exit(1);
  }
}

main();
