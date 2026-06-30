import { AiSavedSnippet } from '@/db/entities';
import { getEm } from '@/db/orm';
import { createId } from '@/utils/license-key';
import type { AICreateSnippetInput } from '@/common/validations/ai.validation';

export class AISnippetService {
  async list(workspaceId: string, connectionId: string) {
    const em = getEm();
    const rows = await em.find(
      AiSavedSnippet,
      { workspaceId, connectionId },
      { orderBy: { updatedAt: 'DESC' } },
    );
    return rows.map((row: AiSavedSnippet) => this.toResponse(row));
  }

  async get(snippetId: string) {
    const em = getEm();
    const row = await em.findOne(AiSavedSnippet, { id: snippetId });
    if (!row) {
      throw new Error('AI_SNIPPET_NOT_FOUND');
    }
    return this.toResponse(row);
  }

  async create(input: AICreateSnippetInput & { createdByUserId?: string | null }) {
    const em = getEm();
    const now = new Date();
    const row = em.create(AiSavedSnippet, {
      id: createId(),
      workspaceId: input.workspaceId,
      connectionId: input.connectionId,
      threadId: input.threadId ?? null,
      title: input.title,
      sql: input.sql,
      dialect: input.dialect ?? null,
      sourceIntent: input.sourceIntent ?? null,
      provenanceMessageId: input.provenanceMessageId ?? null,
      createdByUserId: input.createdByUserId ?? null,
      createdAt: now,
      updatedAt: now,
    });
    em.persist(row);
    await em.flush();
    return this.toResponse(row);
  }

  private toResponse(row: AiSavedSnippet) {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      connectionId: row.connectionId,
      threadId: row.threadId ?? null,
      title: row.title,
      sql: row.sql,
      dialect: row.dialect ?? null,
      sourceIntent: row.sourceIntent ?? null,
      provenanceMessageId: row.provenanceMessageId ?? null,
      createdByUserId: row.createdByUserId ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
