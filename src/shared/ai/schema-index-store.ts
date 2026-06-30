import {
  AiConnectionIndex,
  AiRagDocument,
  AiRagEmbedding,
  AiSchemaColumn,
  AiSchemaIndex,
  AiSchemaObject,
  AiSchemaRelationship,
} from '@/db/entities';
import { getEm } from '@/db/orm';
import type {
  AIDocumentFragment,
  AIQueryHistoryItem,
  AISchemaContext,
  AISchemaTable,
} from '@/types';
import { createId } from '@/utils/license-key';
import { stringifyJson } from '@/utils/common';
import { EmbeddingService, hashContent } from './embedding-service';

export type AIIndexScope = {
  workspaceId: string;
  connectionId: string;
  databaseName?: string | null;
  schemaName?: string | null;
  engine?: string | null;
};

export type IndexSchemaInput = AIIndexScope & {
  schemaContext: AISchemaContext;
};

export type IndexQueryHistoryInput = AIIndexScope & {
  items: AIQueryHistoryItem[];
};

export type IndexDocsInput = AIIndexScope & {
  docs: AIDocumentFragment[];
};

function now() {
  return new Date();
}

function norm(value?: string | null) {
  const trimmed = String(value ?? '').trim();
  return trimmed || null;
}

function sourceScope(scope: AIIndexScope) {
  return {
    workspaceId: scope.workspaceId,
    connectionId: scope.connectionId,
    databaseName: norm(scope.databaseName),
    schemaName: norm(scope.schemaName),
  };
}

function tableChunk(table: AISchemaTable) {
  const schemaPrefix = table.schema ? `${table.schema}.` : '';
  const columns = (table.columns ?? [])
    .map((column) =>
      [
        column.name,
        column.type ? `type=${column.type}` : '',
        column.nullable === false ? 'not null' : '',
        column.isPrimaryKey ? 'primary key' : '',
        column.defaultValue ? `default=${column.defaultValue}` : '',
        column.comment ? `comment=${column.comment}` : '',
      ]
        .filter(Boolean)
        .join(' '),
    )
    .join('\n');
  const indexes = (table.indexes ?? [])
    .map(
      (index) =>
        `${index.name}(${index.columns.join(', ')})${index.unique ? ' unique' : ''}${index.comment ? ` comment=${index.comment}` : ''}`,
    )
    .join('\n');
  const foreignKeys = (table.foreignKeys ?? [])
    .map(
      (fk) =>
        `${fk.columns.join(', ')} -> ${fk.referencedSchema ? `${fk.referencedSchema}.` : ''}${fk.referencedTable}(${fk.referencedColumns.join(', ')})`,
    )
    .join('\n');

  return [
    `Table: ${schemaPrefix}${table.name}`,
    table.comment ? `Comment: ${table.comment}` : '',
    columns ? `Columns:\n${columns}` : '',
    indexes ? `Indexes:\n${indexes}` : '',
    foreignKeys ? `Relationships:\n${foreignKeys}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export class SchemaIndexService {
  private embeddings = new EmbeddingService();

  async enable(scope: AIIndexScope) {
    const em = getEm();
    const existing = await this.findConnectionIndex(em, scope);
    const date = now();
    const row =
      existing ??
      em.create(AiConnectionIndex, {
        id: createId(),
        ...sourceScope(scope),
        engine: scope.engine ?? null,
        enabled: true,
        status: 'enabled',
        lastIndexedAt: null,
        createdAt: date,
        updatedAt: date,
      });

    row.enabled = true;
    row.status = 'enabled';
    row.engine = scope.engine ?? row.engine ?? null;
    row.updatedAt = date;
    em.persist(row);
    await em.flush();
    return row;
  }

  async disable(scope: AIIndexScope) {
    const em = getEm();
    const row = await this.findConnectionIndex(em, scope);
    if (!row) return null;
    row.enabled = false;
    row.status = 'disabled';
    row.updatedAt = now();
    await em.flush();
    return row;
  }

  async status(scope: AIIndexScope) {
    const em = getEm();
    return this.findConnectionIndex(em, scope);
  }

  async clear(scope: AIIndexScope) {
    const em = getEm();
    await em.nativeDelete(AiRagEmbedding, sourceScope(scope));
    await em.nativeDelete(AiRagDocument, sourceScope(scope));
    await em.nativeDelete(AiSchemaRelationship, sourceScope(scope));
    await em.nativeDelete(AiSchemaIndex, sourceScope(scope));
    await em.nativeDelete(AiSchemaColumn, sourceScope(scope));
    await em.nativeDelete(AiSchemaObject, sourceScope(scope));
    const index = await this.findConnectionIndex(em, scope);
    if (index) {
      index.lastIndexedAt = null;
      index.status = index.enabled ? 'enabled' : 'disabled';
      index.updatedAt = now();
      await em.flush();
    }
    return { cleared: true };
  }

  async indexSchema(input: IndexSchemaInput) {
    await this.assertEnabled(input);
    const em = getEm();
    const scope = sourceScope(input);
    const date = now();

    await em.nativeDelete(AiRagEmbedding, { ...scope, sourceType: 'schema_object' });
    await em.nativeDelete(AiRagDocument, { ...scope, sourceType: 'schema_object' });
    await em.nativeDelete(AiSchemaRelationship, scope);
    await em.nativeDelete(AiSchemaIndex, scope);
    await em.nativeDelete(AiSchemaColumn, scope);
    await em.nativeDelete(AiSchemaObject, scope);

    let objectCount = 0;
    let documentCount = 0;
    for (const table of input.schemaContext.tables ?? []) {
      const objectId = createId();
      objectCount += 1;
      em.persist(
        em.create(AiSchemaObject, {
          id: objectId,
          ...scope,
          schemaName: norm(table.schema) ?? scope.schemaName,
          objectType: 'table',
          objectName: table.name,
          comment: table.comment ?? null,
          metadataJson: stringifyJson({
            indexes: table.indexes ?? [],
            foreignKeys: table.foreignKeys ?? [],
          }),
          createdAt: date,
          updatedAt: date,
        }),
      );

      for (const [index, column] of (table.columns ?? []).entries()) {
        em.persist(
          em.create(AiSchemaColumn, {
            id: createId(),
            objectId,
            workspaceId: scope.workspaceId,
            connectionId: scope.connectionId,
            schemaName: norm(table.schema) ?? scope.schemaName,
            tableName: table.name,
            columnName: column.name,
            dataType: column.type ?? null,
            nullable: column.nullable ?? null,
            isPrimaryKey: Boolean(column.isPrimaryKey),
            defaultValue: column.defaultValue ?? null,
            comment: column.comment ?? null,
            ordinalPosition: index + 1,
          }),
        );
      }

      for (const index of table.indexes ?? []) {
        em.persist(
          em.create(AiSchemaIndex, {
            id: createId(),
            workspaceId: scope.workspaceId,
            connectionId: scope.connectionId,
            schemaName: norm(table.schema) ?? scope.schemaName,
            tableName: table.name,
            indexName: index.name,
            columnsJson: stringifyJson(index.columns),
            unique: Boolean(index.unique),
            comment: index.comment ?? null,
          }),
        );
      }

      for (const fk of table.foreignKeys ?? []) {
        em.persist(
          em.create(AiSchemaRelationship, {
            id: createId(),
            workspaceId: scope.workspaceId,
            connectionId: scope.connectionId,
            schemaName: norm(table.schema) ?? scope.schemaName,
            tableName: table.name,
            columnsJson: stringifyJson(fk.columns),
            referencedSchema: fk.referencedSchema ?? null,
            referencedTable: fk.referencedTable,
            referencedColumnsJson: stringifyJson(fk.referencedColumns),
          }),
        );
      }

      const content = tableChunk(table);
      await this.persistDocument(em, {
        ...input,
        schemaName: norm(table.schema) ?? scope.schemaName,
        sourceType: 'schema_object',
        sourceId: `${table.schema ?? scope.schemaName ?? 'default'}.${table.name}`,
        title: `Schema: ${table.schema ? `${table.schema}.` : ''}${table.name}`,
        content,
        metadata: { objectType: 'table', tableName: table.name },
      });
      documentCount += 1;
    }

    await this.markIndexed(input, 'indexed');
    return { objectCount, documentCount };
  }

  async indexQueryHistory(input: IndexQueryHistoryInput) {
    await this.assertEnabled(input);
    const em = getEm();
    let documentCount = 0;
    for (const item of input.items.slice(0, 50)) {
      const content = [
        `Query status: ${item.status ?? 'unknown'}`,
        item.executedAt ? `Executed at: ${item.executedAt}` : '',
        item.durationMs != null ? `Duration ms: ${item.durationMs}` : '',
        item.error ? `Error: ${item.error}` : '',
        `SQL:\n${item.sql.slice(0, 10_000)}`,
      ]
        .filter(Boolean)
        .join('\n');
      await this.persistDocument(em, {
        ...input,
        sourceType: 'query_history',
        sourceId: item.id ?? hashContent(content),
        title: 'Query history',
        content,
        metadata: { status: item.status ?? null, executedAt: item.executedAt ?? null },
      });
      documentCount += 1;
    }
    await this.markIndexed(input, 'indexed');
    return { documentCount };
  }

  async indexDocs(input: IndexDocsInput) {
    await this.assertEnabled(input);
    const em = getEm();
    let documentCount = 0;
    for (const doc of input.docs.slice(0, 100)) {
      await this.persistDocument(em, {
        ...input,
        sourceType: 'doc',
        sourceId: doc.sourceId,
        title: doc.title ?? doc.path ?? 'Document',
        content: doc.content.slice(0, 20_000),
        metadata: { path: doc.path ?? null },
      });
      documentCount += 1;
    }
    await this.markIndexed(input, 'indexed');
    return { documentCount };
  }

  private async assertEnabled(scope: AIIndexScope) {
    const row = await this.status(scope);
    if (!row?.enabled) {
      throw new Error('AI_INDEXING_NOT_ENABLED');
    }
  }

  private async markIndexed(scope: AIIndexScope, status: string) {
    const em = getEm();
    const row = await this.findConnectionIndex(em, scope);
    if (!row) return;
    row.status = status;
    row.lastIndexedAt = now();
    row.updatedAt = now();
    await em.flush();
  }

  private async persistDocument(
    em: ReturnType<typeof getEm>,
    input: AIIndexScope & {
      sourceType: string;
      sourceId: string;
      title: string | null;
      content: string;
      metadata: Record<string, unknown>;
    },
  ) {
    const date = now();
    const scope = sourceScope(input);
    const contentHash = hashContent(input.content);
    const existing = await em.findOne(AiRagDocument, {
      ...scope,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      contentHash,
    });
    if (existing) return existing;

    const doc = em.create(AiRagDocument, {
      id: createId(),
      ...scope,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      title: input.title,
      content: input.content,
      contentHash,
      metadataJson: stringifyJson(input.metadata),
      createdAt: date,
      updatedAt: date,
    });
    em.persist(doc);
    await em.flush();

    const embedding = await this.embeddings.embed(input.content);
    em.persist(
      em.create(AiRagEmbedding, {
        id: createId(),
        documentId: doc.id,
        ...scope,
        sourceType: input.sourceType,
        contentHash,
        model: embedding.model,
        dimensions: embedding.dimensions,
        embeddingVector: embedding.vectorText,
        createdAt: date,
      }),
    );
    await em.flush();
    return doc;
  }

  private async findConnectionIndex(em: ReturnType<typeof getEm>, scope: AIIndexScope) {
    return em.findOne(AiConnectionIndex, sourceScope(scope));
  }
}
