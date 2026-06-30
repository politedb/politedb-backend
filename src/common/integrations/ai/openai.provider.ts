import type { AIProvider } from './ai.provider';
import type { AIChatInput, AIChatResult, AIProviderName, AIStreamChunk } from '@/types';

type OpenAIChatResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

type OpenAICompatibleProviderConfig = {
  name: AIProviderName;
  apiKey: string;
  baseUrl: string;
};

function providerHeaders(apiKey: string) {
  if (!apiKey) {
    throw new Error('AI_PROVIDER_NOT_CONFIGURED');
  }
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

function safeProviderError(status: number) {
  if (status === 401 || status === 403) return 'AI_PROVIDER_AUTH_FAILED';
  if (status === 429) return 'AI_PROVIDER_RATE_LIMITED';
  if (status >= 500) return 'AI_PROVIDER_UNAVAILABLE';
  return 'AI_PROVIDER_REQUEST_FAILED';
}

function parseStreamTextChunk(parsed: any) {
  return String(parsed?.choices?.[0]?.delta?.content ?? '');
}

export class OpenAICompatibleProvider implements AIProvider {
  name: AIProviderName;
  private apiKey: string;
  private baseUrl: string;

  constructor(config: OpenAICompatibleProviderConfig) {
    this.name = config.name;
    this.apiKey = config.apiKey.trim();
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
  }

  async chat(input: AIChatInput): Promise<AIChatResult> {
    const startedAt = Date.now();
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: providerHeaders(this.apiKey),
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        temperature: input.temperature ?? 0.2,
        max_tokens: input.maxOutputTokens ?? 1024,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(safeProviderError(response.status));
    }

    const payload = (await response.json()) as OpenAIChatResponse;
    const text = String(payload.choices?.[0]?.message?.content ?? '').trim();
    const inputTokens = Number(payload.usage?.prompt_tokens ?? 0);
    const outputTokens = Number(payload.usage?.completion_tokens ?? 0);

    return {
      text,
      model: input.model,
      provider: this.name,
      inputTokens,
      outputTokens,
      latencyMs: Date.now() - startedAt,
      raw: payload.usage,
    };
  }

  async *streamChat(input: AIChatInput): AsyncIterable<AIStreamChunk> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: providerHeaders(this.apiKey),
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        temperature: input.temperature ?? 0.2,
        max_tokens: input.maxOutputTokens ?? 1024,
        stream: true,
      }),
    });

    if (!response.ok || !response.body) {
      yield { type: 'error', error: safeProviderError(response.status) };
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;

        const data = trimmed.slice(5).trim();
        if (!data || data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const text = parseStreamTextChunk(parsed);
          if (text) yield { type: 'token', text };
        } catch {
          // Ignore malformed provider chunks.
        }
      }
    }
  }
}
