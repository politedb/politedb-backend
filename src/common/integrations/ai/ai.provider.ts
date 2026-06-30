import type { AIChatInput, AIChatResult, AIProviderName, AIStreamChunk } from '@/types';

export interface AIProvider {
  name: AIProviderName;

  chat(input: AIChatInput): Promise<AIChatResult>;

  streamChat(input: AIChatInput): AsyncIterable<AIStreamChunk>;

  countTokens?(input: string): Promise<number>;

  embedding?(input: string): Promise<number[]>;
}
