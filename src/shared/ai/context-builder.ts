import crypto from 'node:crypto';
import type { AITurnRequestInput } from '@/common/validations/ai.validation';
import type {
  AIDocumentFragment,
  AIEditorContext,
  AIQueryHistoryItem,
  AIQueryResultContext,
  AISchemaContext,
} from '@/types';
import type { UserPlan } from '@/types';
import { SchemaContextService } from './schema-context';
import { normalizeSql } from '@/utils/common';

export type BuiltAIContext = {
  workspaceId: string;
  connectionId: string;
  editorContext: AIEditorContext;
  schemaContext: AISchemaContext;
  queryHistory: AIQueryHistoryItem[];
  queryResultContext: AIQueryResultContext | null;
  docsContext: AIDocumentFragment[];
  allowedTools: string[];
  contextText: string;
  contextHash: string;
};

const QUERY_HISTORY_LIMIT_BY_PLAN: Record<UserPlan, number> = {
  FREE: 15,
  ULTIMATE: 50,
};

const DOCS_LIMIT_BY_PLAN: Record<UserPlan, number> = {
  FREE: 6,
  ULTIMATE: 12,
};

function hash(value: unknown) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export class ContextBuilderService {
  private schemaContext = new SchemaContextService();

  build(input: AITurnRequestInput, plan: UserPlan): BuiltAIContext {
    const editorContext = {
      currentSql: normalizeSql(input.editorContext?.currentSql ?? undefined) || null,
      selectedSql: normalizeSql(input.editorContext?.selectedSql ?? undefined) || null,
      activeDatabase: input.editorContext?.activeDatabase ?? null,
      activeSchema: input.editorContext?.activeSchema ?? null,
      activeTable: input.editorContext?.activeTable ?? null,
      activeTab: input.editorContext?.activeTab ?? null,
    };
    const schemaContext = this.schemaContext.normalize(input.schemaContext);
    const queryHistory = input.queryHistory.slice(0, QUERY_HISTORY_LIMIT_BY_PLAN[plan]);
    const docsContext = input.docsContext.slice(0, DOCS_LIMIT_BY_PLAN[plan]);
    const queryResultContext = input.queryResultContext ?? null;

    const context = {
      workspaceId: input.workspaceId,
      connectionId: input.connectionId,
      editorContext,
      schemaContext,
      queryHistory,
      queryResultContext,
      docsContext,
      allowedTools: input.allowedTools,
    };

    const lines = [
      `Workspace: ${input.workspaceId}`,
      `Connection: ${input.connectionId}`,
      editorContext.activeDatabase ? `Active database: ${editorContext.activeDatabase}` : '',
      editorContext.activeSchema ? `Active schema: ${editorContext.activeSchema}` : '',
      editorContext.activeTable ? `Active table: ${editorContext.activeTable}` : '',
      editorContext.activeTab ? `Active tab: ${editorContext.activeTab}` : '',
      editorContext.currentSql ? `Current SQL:\n${editorContext.currentSql}` : '',
      editorContext.selectedSql ? `Selected SQL:\n${editorContext.selectedSql}` : '',
      this.schemaContext.buildVisibleSchemaContext(schemaContext),
      this.buildQueryHistoryContext(queryHistory),
      this.buildQueryResultContext(queryResultContext),
      this.buildDocsContext(docsContext),
      input.allowedTools.length ? `Allowed tools: ${input.allowedTools.join(', ')}` : '',
    ].filter(Boolean);

    return {
      ...context,
      contextText: lines.join('\n\n'),
      contextHash: hash(context),
    };
  }

  private buildQueryHistoryContext(items: AIQueryHistoryItem[]) {
    if (!items.length) {
      return '';
    }

    return `Recent query history:\n${items
      .map((item, index) => {
        const status = item.status ?? 'unknown';
        const executedAt = item.executedAt ?? 'unknown time';
        const errorPart = item.error ? ` error=${item.error}` : '';
        return `${index + 1}. [${status}] ${executedAt}\n${item.sql}${errorPart}`;
      })
      .join('\n\n')}`;
  }

  private buildQueryResultContext(result: AIQueryResultContext | null) {
    if (!result) {
      return '';
    }

    const sampleRows = (result.rows ?? []).slice(0, 5);
    const columnSummary = result.columns?.length
      ? result.columns
          .map((column) => `${column.name}${column.type ? ` (${column.type})` : ''}`)
          .join(', ')
      : '';

    return [
      'Query result context:',
      columnSummary ? `Columns: ${columnSummary}` : '',
      result.rowCount != null ? `Row count: ${result.rowCount}` : '',
      result.summary ? `Summary: ${result.summary}` : '',
      sampleRows.length ? `Sample rows:\n${JSON.stringify(sampleRows, null, 2)}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private buildDocsContext(docs: AIDocumentFragment[]) {
    if (!docs.length) {
      return '';
    }

    return `PoliteDB docs fragments available: ${docs.length}`;
  }
}
