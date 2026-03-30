import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let loaded = false;

const normalize = (value) => String(value || '')
  .trim()
  .replace(/^['"]|['"]$/g, '')
  .toLowerCase();

export const loadBookFriendEnv = () => {
  if (loaded) {
    return;
  }

  const candidates = [
    path.resolve(__dirname, '..', '.env'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'bookfriend-server', '.env'),
  ];

  for (const envPath of candidates) {
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
      loaded = true;
      return;
    }
  }

  dotenv.config();
  loaded = true;
};

export const resolveLlmProvider = () => {
  const explicitProvider = normalize(process.env.BOOKFRIEND_LLM_PROVIDER);
  if (explicitProvider) {
    return { provider: explicitProvider, source: 'env:BOOKFRIEND_LLM_PROVIDER' };
  }

  if (process.env.BOOKFRIEND_OLLAMA_MODEL || process.env.BOOKFRIEND_OLLAMA_URL) {
    return { provider: 'ollama', source: 'inferred:ollama-env' };
  }

  if (process.env.GROQ_API_KEY || process.env.BOOKFRIEND_GROQ_API_KEY) {
    return { provider: 'groq', source: 'inferred:groq-key' };
  }

  if (process.env.OPENAI_API_KEY) {
    return { provider: 'openai', source: 'inferred:openai-key' };
  }

  return { provider: 'mock', source: 'default:fallback' };
};
