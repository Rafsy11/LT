import { env } from '@/env';

export interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaChatResponse {
  model: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
}

const OLLAMA_HEALTH_TIMEOUT_MS = 2000;
const OLLAMA_CHAT_TIMEOUT_MS = 45000;
const OLLAMA_CONTEXT_WINDOW = 8192;

class OllamaClient {
  public getBaseUrl(): string {
    const raw = (process.env.OLLAMA_BASE_URL || env.OLLAMA_BASE_URL || 'http://localhost:11434').trim();
    return raw.replace(/\/+$/, '').replace(/\/api$/, '').replace(/\/v1$/, '');
  }

  public getOpenAIBaseUrl(): string {
    return `${this.getBaseUrl()}/v1`;
  }

  public getActiveModel(): string {
    return (process.env.OLLAMA_MODEL || env.OLLAMA_MODEL || 'qwen2.5:7b').trim();
  }

  public async isHealthy(): Promise<boolean> {
    try {
      const res = await fetch(`${this.getBaseUrl()}/api/version`, {
        method: 'GET',
        signal: AbortSignal.timeout(OLLAMA_HEALTH_TIMEOUT_MS),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  public async chat(messages: OllamaChatMessage[], systemPrompt?: string): Promise<string> {
    const formattedMessages: OllamaChatMessage[] = [];

    if (systemPrompt) {
      formattedMessages.push({ role: 'system', content: systemPrompt });
    }
    formattedMessages.push(...messages);

    try {
      const res = await fetch(`${this.getBaseUrl()}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.getActiveModel(),
          messages: formattedMessages,
          stream: false,
          options: {
            temperature: 0.2,
            num_ctx: OLLAMA_CONTEXT_WINDOW,
          },
        }),
        signal: AbortSignal.timeout(OLLAMA_CHAT_TIMEOUT_MS),
      });

      if (!res.ok) {
        throw new Error(`Ollama returned status ${res.status}`);
      }

      const data = (await res.json()) as OllamaChatResponse;
      return data.message.content;
    } catch (err) {
      console.warn('[Ollama] Local LLM unreachable or timed out:', (err as Error).message);
      throw err;
    }
  }
}

declare global {
  var ollamaClientGlobal: OllamaClient | undefined;
}

export const ollamaClient = globalThis.ollamaClientGlobal || new OllamaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.ollamaClientGlobal = ollamaClient;
}
