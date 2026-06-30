import { AiMessage, AiThread } from '@/db/entities';
import { getEm } from '@/db/orm';
import { createId } from '@/utils/license-key';
import type { AICreateThreadInput } from '@/common/validations/ai.validation';
import type {
  AIArtifact,
  AICitation,
  AIStoredMessage,
  AIThreadDetail,
  AIThreadSummary,
  AIToolProposalPayload,
} from '@/types';
import { parseJsonText, stringifyJson } from '@/utils/common';

type PersistMessageInput = {
  threadId: string;
  role: 'user' | 'assistant' | 'tool';
  intent?: string | null;
  content: string;
  artifacts?: AIArtifact[];
  toolProposals?: AIToolProposalPayload[];
  citations?: AICitation[];
};

export class AIThreadService {
  async createOrResume(input: AICreateThreadInput) {
    const em = getEm();
    const now = new Date();

    if (input.threadId) {
      const existing = await em.findOne(AiThread, { id: input.threadId });
      if (!existing) {
        throw new Error('AI_THREAD_NOT_FOUND');
      }
      if (
        existing.workspaceId !== input.workspaceId ||
        existing.connectionId !== input.connectionId
      ) {
        throw new Error('AI_THREAD_SCOPE_MISMATCH');
      }
      if (input.title) {
        existing.title = input.title;
      }
      if (input.provider) {
        existing.provider = input.provider;
      }
      if (input.model) {
        existing.modelName = input.model;
      }
      existing.updatedAt = now;
      await em.flush();
      return this.toThreadSummary(existing);
    }

    const thread = em.create(AiThread, {
      id: createId(),
      workspaceId: input.workspaceId,
      connectionId: input.connectionId,
      title: input.title ?? null,
      provider: input.provider ?? null,
      modelName: input.model ?? null,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
    em.persist(thread);
    await em.flush();
    return this.toThreadSummary(thread);
  }

  async getThread(threadId: string, memory: AIThreadDetail['memory']) {
    const em = getEm();
    const thread = await em.findOne(AiThread, { id: threadId });
    if (!thread) {
      throw new Error('AI_THREAD_NOT_FOUND');
    }
    const messages = await em.find(AiMessage, { threadId }, { orderBy: { createdAt: 'ASC' } });
    return {
      thread: this.toThreadSummary(thread),
      memory,
      messages: messages.map((message: AiMessage) => this.toStoredMessage(message)),
    } satisfies AIThreadDetail;
  }

  async getThreadSummary(threadId: string) {
    const em = getEm();
    const thread = await em.findOne(AiThread, { id: threadId });
    if (!thread) {
      throw new Error('AI_THREAD_NOT_FOUND');
    }
    return this.toThreadSummary(thread);
  }

  async appendMessage(input: PersistMessageInput) {
    const em = getEm();
    const thread = await em.findOne(AiThread, { id: input.threadId });
    if (!thread) {
      throw new Error('AI_THREAD_NOT_FOUND');
    }

    const message = em.create(AiMessage, {
      id: createId(),
      threadId: input.threadId,
      role: input.role,
      intent: input.intent ?? null,
      content: input.content,
      artifactsJson: input.artifacts?.length ? stringifyJson(input.artifacts) : null,
      toolProposalsJson: input.toolProposals?.length ? stringifyJson(input.toolProposals) : null,
      citationsJson: input.citations?.length ? stringifyJson(input.citations) : null,
      createdAt: new Date(),
    });
    thread.updatedAt = new Date();
    em.persist(message);
    await em.flush();
    return this.toStoredMessage(message);
  }

  async listRecentMessages(threadId: string, limit = 12) {
    const em = getEm();
    const rows = await em.find(AiMessage, { threadId }, { orderBy: { createdAt: 'DESC' }, limit });
    return rows.reverse().map((row: AiMessage) => this.toStoredMessage(row));
  }

  toThreadSummary(thread: AiThread): AIThreadSummary {
    return {
      id: thread.id,
      workspaceId: thread.workspaceId,
      connectionId: thread.connectionId,
      title: thread.title ?? null,
      provider: thread.provider ?? null,
      model: thread.modelName ?? null,
      status: thread.status as AIThreadSummary['status'],
      createdAt: thread.createdAt.toISOString(),
      updatedAt: thread.updatedAt.toISOString(),
    };
  }

  toStoredMessage(message: AiMessage): AIStoredMessage {
    return {
      id: message.id,
      threadId: message.threadId,
      role: message.role as AIStoredMessage['role'],
      intent: message.intent ?? null,
      content: message.content,
      artifacts: parseJsonText<AIArtifact[]>(message.artifactsJson, []),
      toolProposals: parseJsonText<AIToolProposalPayload[]>(message.toolProposalsJson, []),
      citations: parseJsonText<AICitation[]>(message.citationsJson, []),
      createdAt: message.createdAt.toISOString(),
    };
  }
}
