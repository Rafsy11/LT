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

class OllamaClient {
  private baseUrl: string;
  private model: string;

  constructor() {
    this.baseUrl = (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/+$/, '');
    this.model = process.env.OLLAMA_MODEL || 'qwen2.5:7b';
  }

  public async isHealthy(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/version`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  public async chat(
    messages: OllamaChatMessage[],
    systemPrompt?: string
  ): Promise<string> {
    const formattedMessages: OllamaChatMessage[] = [];

    if (systemPrompt) {
      formattedMessages.push({ role: 'system', content: systemPrompt });
    }
    formattedMessages.push(...messages);

    try {
      const res = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages: formattedMessages,
          stream: false,
          options: {
            temperature: 0.2, // deterministic for ops commands
            num_ctx: 4096,
          },
        }),
        signal: AbortSignal.timeout(15000),
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
  // eslint-disable-next-line no-var
  var ollamaClientGlobal: OllamaClient | undefined;
}

export const ollamaClient = globalThis.ollamaClientGlobal || new OllamaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.ollamaClientGlobal = ollamaClient;
}
