import crypto from 'node:crypto';
import { env } from '@/config/env';

export function hashContent(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function vectorToSql(value: number[]) {
  return `[${value.map((item) => Number(item).toFixed(8)).join(',')}]`;
}

export class EmbeddingService {
  async embed(text: string) {
    if (!env.openAiApiKey) {
      throw new Error('AI_EMBEDDING_PROVIDER_NOT_CONFIGURED');
    }

    const res = await fetch(`${env.openAiBaseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.openAiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: env.aiEmbeddingModel,
        input: text.slice(0, 24_000),
        dimensions: env.aiEmbeddingDimensions,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(
        `AI_EMBEDDING_REQUEST_FAILED: ${res.status} ${res.statusText}${body ? ` - ${body.slice(0, 240)}` : ''}`,
      );
    }

    const data = await res.json();
    const vector = data?.data?.[0]?.embedding;
    if (!Array.isArray(vector)) {
      throw new Error('AI_EMBEDDING_RESPONSE_INVALID');
    }

    return {
      model: env.aiEmbeddingModel,
      dimensions: vector.length,
      vectorText: vectorToSql(vector),
    };
  }
}
