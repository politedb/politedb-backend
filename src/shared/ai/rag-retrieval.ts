import { getEm } from '@/db/orm';
import type { AICitation } from '@/types';
import { EmbeddingService } from './embedding-service';

export type RagRetrievalInput = {
  workspaceId: string;
  connectionId: string;
  databaseName?: string | null;
  schemaName?: string | null;
  query: string;
  limit?: number;
};

type RagRow = {
  document_id: string;
  source_type: string;
  source_id: string;
  title: string | null;
  content: string;
  distance: number;
};

export class RagRetrievalService {
  private embeddings = new EmbeddingService();

  async retrieve(input: RagRetrievalInput): Promise<AICitation[]> {
    if (!input.query.trim()) return [];

    const embedding = await this.embeddings.embed(input.query);
    const em = getEm();
    const rows = (await em.getConnection().execute(
      `
        SELECT
          d.id AS document_id,
          d.source_type,
          d.source_id,
          d.title,
          d.content,
          e.embedding_vector <=> ?::vector AS distance
        FROM ai_rag_embeddings e
        JOIN ai_rag_documents d ON d.id = e.document_id
        WHERE e.workspace_id = ?
          AND e.connection_id = ?
          AND (?::text IS NULL OR e.database_name IS NULL OR e.database_name = ?)
          AND (?::text IS NULL OR e.schema_name IS NULL OR e.schema_name = ?)
        ORDER BY e.embedding_vector <=> ?::vector
        LIMIT ?
      `,
      [
        embedding.vectorText,
        input.workspaceId,
        input.connectionId,
        input.databaseName ?? null,
        input.databaseName ?? null,
        input.schemaName ?? null,
        input.schemaName ?? null,
        embedding.vectorText,
        input.limit ?? 6,
      ],
    )) as RagRow[];

    return rows.map((row: RagRow) => ({
      sourceId: `${row.source_type}:${row.source_id}`,
      title: row.title ?? row.source_id,
      path: null,
      snippet: row.content.slice(0, 900),
      score: Math.max(0, 1 - Number(row.distance ?? 1)),
    }));
  }
}
