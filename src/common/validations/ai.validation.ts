import { z } from 'zod';
import { AIIntent } from '@/shared/ai/intent-classifier';
import { AI_TOOL_NAMES } from '@/types';

export const aiIntentSchema = z.enum(AIIntent);
export const aiProviderSchema = z.enum([
  'openai',
  'deepseek',
  'anthropic',
  'google',
  'xai',
  'moonshot',
  'zhipu',
]);
export const aiToolNameSchema = z.enum(AI_TOOL_NAMES);

export const aiSchemaColumnSchema = z.object({
  name: z.string().min(1),
  type: z.string().trim().nullable().optional(),
  nullable: z.boolean().optional(),
  isPrimaryKey: z.boolean().optional(),
  defaultValue: z.string().trim().nullable().optional(),
  comment: z.string().trim().nullable().optional(),
});

export const aiSchemaIndexSchema = z.object({
  name: z.string().min(1),
  columns: z.array(z.string().min(1)).min(1),
  unique: z.boolean().optional(),
  comment: z.string().trim().nullable().optional(),
});

export const aiSchemaForeignKeySchema = z.object({
  columns: z.array(z.string().min(1)).min(1),
  referencedSchema: z.string().trim().nullable().optional(),
  referencedTable: z.string().min(1),
  referencedColumns: z.array(z.string().min(1)).min(1),
});

export const aiSchemaTableSchema = z.object({
  schema: z.string().trim().nullable().optional(),
  name: z.string().min(1),
  columns: z.array(aiSchemaColumnSchema).optional(),
  indexes: z.array(aiSchemaIndexSchema).optional(),
  foreignKeys: z.array(aiSchemaForeignKeySchema).optional(),
  comment: z.string().trim().nullable().optional(),
});

export const aiSchemaContextSchema = z.object({
  tables: z.array(aiSchemaTableSchema).default([]),
});

export const aiQueryHistoryItemSchema = z.object({
  id: z.string().trim().nullable().optional(),
  sql: z.string().min(1).max(50_000),
  status: z.enum(['success', 'error', 'cancelled', 'draft']).nullable().optional(),
  executedAt: z.string().trim().nullable().optional(),
  durationMs: z.number().finite().nullable().optional(),
  error: z.string().trim().nullable().optional(),
});

export const aiDocumentFragmentSchema = z.object({
  sourceId: z.string().min(1),
  title: z.string().trim().nullable().optional(),
  path: z.string().trim().nullable().optional(),
  content: z.string().min(1).max(20_000),
});

export const aiResultColumnSchema = z.object({
  name: z.string().min(1),
  type: z.string().trim().nullable().optional(),
});

export const aiQueryResultContextSchema = z.object({
  columns: z.array(aiResultColumnSchema).optional(),
  rows: z.array(z.record(z.string(), z.unknown())).optional(),
  rowCount: z.number().int().nonnegative().nullable().optional(),
  summary: z.string().trim().nullable().optional(),
});

export const aiEditorContextSchema = z.object({
  currentSql: z.string().max(50_000).nullable().optional(),
  selectedSql: z.string().max(20_000).nullable().optional(),
  activeDatabase: z.string().trim().nullable().optional(),
  activeSchema: z.string().trim().nullable().optional(),
  activeTable: z.string().trim().nullable().optional(),
  activeTab: z.string().trim().nullable().optional(),
});

export const aiCreateThreadSchema = z.object({
  threadId: z.string().trim().optional(),
  workspaceId: z.string().min(1),
  connectionId: z.string().min(1),
  title: z.string().trim().max(200).optional(),
  provider: aiProviderSchema.optional(),
  model: z.string().trim().min(1).max(200).optional(),
});

export const aiTurnRequestSchema = z.object({
  userMessage: z.string().min(1).max(20_000),
  provider: aiProviderSchema.optional(),
  model: z.string().trim().min(1).max(200).optional(),
  intent: aiIntentSchema.optional(),
  workspaceId: z.string().min(1),
  connectionId: z.string().min(1),
  editorContext: aiEditorContextSchema.optional(),
  schemaContext: aiSchemaContextSchema.optional(),
  queryHistory: z.array(aiQueryHistoryItemSchema).default([]),
  queryResultContext: aiQueryResultContextSchema.optional(),
  docsContext: z.array(aiDocumentFragmentSchema).default([]),
  allowedTools: z.array(aiToolNameSchema).default([]),
});

export const aiConfirmToolProposalSchema = z.object({
  confirmedByUserId: z.string().trim().optional(),
});

export const aiCreateSnippetSchema = z.object({
  workspaceId: z.string().min(1),
  connectionId: z.string().min(1),
  threadId: z.string().trim().optional(),
  title: z.string().trim().min(1).max(200),
  sql: z.string().min(1).max(50_000),
  dialect: z.string().trim().optional(),
  sourceIntent: aiIntentSchema.optional(),
  provenanceMessageId: z.string().trim().optional(),
});

export const aiIndexScopeSchema = z.object({
  workspaceId: z.string().min(1),
  databaseName: z.string().trim().nullable().optional(),
  schemaName: z.string().trim().nullable().optional(),
  engine: z.string().trim().nullable().optional(),
});

export const aiIndexSchemaPayloadSchema = aiIndexScopeSchema.extend({
  connectionId: z.string().min(1),
  schemaContext: aiSchemaContextSchema,
});

export const aiIndexQueryHistoryPayloadSchema = aiIndexScopeSchema.extend({
  connectionId: z.string().min(1),
  items: z.array(aiQueryHistoryItemSchema).default([]),
});

export const aiIndexDocsPayloadSchema = aiIndexScopeSchema.extend({
  connectionId: z.string().min(1),
  docs: z.array(aiDocumentFragmentSchema).default([]),
});

export type AICreateThreadInput = z.infer<typeof aiCreateThreadSchema>;
export type AITurnRequestInput = z.infer<typeof aiTurnRequestSchema>;
export type AIConfirmToolProposalInput = z.infer<typeof aiConfirmToolProposalSchema>;
export type AICreateSnippetInput = z.infer<typeof aiCreateSnippetSchema>;
export type AIIndexScopeInput = z.infer<typeof aiIndexScopeSchema>;
export type AIIndexSchemaPayloadInput = z.infer<typeof aiIndexSchemaPayloadSchema>;
export type AIIndexQueryHistoryPayloadInput = z.infer<typeof aiIndexQueryHistoryPayloadSchema>;
export type AIIndexDocsPayloadInput = z.infer<typeof aiIndexDocsPayloadSchema>;
