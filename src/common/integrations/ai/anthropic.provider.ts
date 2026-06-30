import { env } from '@/config/env';
import type { AIProvider } from './ai.provider';
import type { AIChatInput, AIChatResult, AIStreamChunk } from '@/types';

type AnthropicTextBlock = {
  type: 'text';
  text: string;
};

type AnthropicMessageResponse = {
  content?: AnthropicTextBlock[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
};

type AnthropicStreamEvent = {
  type?: string;
  message?: {
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
    };
  };
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  delta?: {
    type?: string;
    text?: string;
  };
};

function anthropicHeaders(apiKey: string) {
  if (!apiKey) {
    throw new Error('AI_PROVIDER_NOT_CONFIGURED');
  }

  return {
    'x-api-key': apiKey,
    'anthropic-version': env.anthropicVersion,
    'content-type': 'application/json',
  };
}

function safeProviderError(status: number) {
  if (status === 401 || status === 403) return 'AI_PROVIDER_AUTH_FAILED';
  if (status === 429) return 'AI_PROVIDER_RATE_LIMITED';
  if (status >= 500) return 'AI_PROVIDER_UNAVAILABLE';
  return 'AI_PROVIDER_REQUEST_FAILED';
}

function splitSystemMessages(messages: AIChatInput['messages']) {
  const systemParts: string[] = [];
  const conversation: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  for (const message of messages) {
    if (message.role === 'system') {
      systemParts.push(message.content);
      continue;
    }

    conversation.push({
      role: message.role,
      content: message.content,
    });
  }

  if (!conversation.length) {
    conversation.push({
      role: 'user',
      content: 'Hello',
    });
  }

  return {
    system: systemParts.join('\n\n').trim() || undefined,
    messages: conversation,
  };
}

export class AnthropicProvider implements AIProvider {
  name = 'anthropic' as const;
  private apiKey: string;
  private baseUrl: string;

  constructor(config: { apiKey: string; baseUrl: string }) {
    this.apiKey = config.apiKey.trim();
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
  }

  async chat(input: AIChatInput): Promise<AIChatResult> {
    const startedAt = Date.now();
    const body = splitSystemMessages(input.messages);
    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: anthropicHeaders(this.apiKey),
      body: JSON.stringify({
        model: input.model,
        system: body.system,
        messages: body.messages,
        max_tokens: input.maxOutputTokens ?? 1024,
        temperature: input.temperature ?? 0.2,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(safeProviderError(response.status));
    }

    const payload = (await response.json()) as AnthropicMessageResponse;
    const text = (payload.content ?? [])
      .filter((item) => item.type === 'text')
      .map((item) => item.text)
      .join('')
      .trim();

    return {
      text,
      model: input.model,
      provider: this.name,
      inputTokens: Number(payload.usage?.input_tokens ?? 0),
      outputTokens: Number(payload.usage?.output_tokens ?? 0),
      latencyMs: Date.now() - startedAt,
      raw: payload.usage,
    };
  }

  async *streamChat(input: AIChatInput): AsyncIterable<AIStreamChunk> {
    const body = splitSystemMessages(input.messages);
    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: anthropicHeaders(this.apiKey),
      body: JSON.stringify({
        model: input.model,
        system: body.system,
        messages: body.messages,
        max_tokens: input.maxOutputTokens ?? 1024,
        temperature: input.temperature ?? 0.2,
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
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() ?? '';

      for (const chunk of chunks) {
        const lines = chunk
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean);
        const dataLine = lines.find((line) => line.startsWith('data:'));
        if (!dataLine) continue;

        const data = dataLine.slice(5).trim();
        if (!data) continue;

        try {
          const parsed = JSON.parse(data) as AnthropicStreamEvent;
          if (
            parsed.type === 'content_block_delta' &&
            parsed.delta?.type === 'text_delta' &&
            parsed.delta.text
          ) {
            yield { type: 'token', text: parsed.delta.text };
          }
        } catch {
          // Ignore malformed SSE chunks.
        }
      }
    }
  }
}
