export const AI_THREAD_STATUS = ['active', 'archived'] as const;
export type AIThreadStatus = (typeof AI_THREAD_STATUS)[number];

export const AI_MESSAGE_ROLE = ['user', 'assistant', 'tool'] as const;
export type AIMessageRole = (typeof AI_MESSAGE_ROLE)[number];

export const AI_TOOL_NAMES = [
  'open_table',
  'create_tab',
  'export_csv',
  'explain_index',
  'generate_migration',
] as const;
export type AIToolName = (typeof AI_TOOL_NAMES)[number];

export const AI_TOOL_PROPOSAL_STATUS = [
  'proposed',
  'confirmed',
  'executed',
  'rejected',
  'failed',
] as const;
export type AIToolProposalStatus = (typeof AI_TOOL_PROPOSAL_STATUS)[number];

export type AISchemaColumn = {
  name: string;
  type?: string | null;
  nullable?: boolean;
  isPrimaryKey?: boolean;
  defaultValue?: string | null;
  comment?: string | null;
};

export type AISchemaIndex = {
  name: string;
  columns: string[];
  unique?: boolean;
  comment?: string | null;
};

export type AISchemaForeignKey = {
  columns: string[];
  referencedSchema?: string | null;
  referencedTable: string;
  referencedColumns: string[];
};

export type AISchemaTable = {
  schema?: string | null;
  name: string;
  columns?: AISchemaColumn[];
  indexes?: AISchemaIndex[];
  foreignKeys?: AISchemaForeignKey[];
  comment?: string | null;
};

export type AISchemaContext = {
  tables: AISchemaTable[];
};

export type AIQueryHistoryItem = {
  id?: string | null;
  sql: string;
  status?: 'success' | 'error' | 'cancelled' | 'draft' | null;
  executedAt?: string | null;
  durationMs?: number | null;
  error?: string | null;
};

export type AIDocumentFragment = {
  sourceId: string;
  title?: string | null;
  path?: string | null;
  content: string;
};

export type AIResultColumn = {
  name: string;
  type?: string | null;
};

export type AIQueryResultContext = {
  columns?: AIResultColumn[];
  rows?: Array<Record<string, unknown>>;
  rowCount?: number | null;
  summary?: string | null;
};

export type AIEditorContext = {
  currentSql?: string | null;
  selectedSql?: string | null;
  activeDatabase?: string | null;
  activeSchema?: string | null;
  activeTable?: string | null;
  activeTab?: string | null;
};

export type AICitation = {
  sourceId: string;
  title?: string | null;
  path?: string | null;
  snippet: string;
  score: number;
};

export type AIMemoryFact = {
  key: string;
  value: string;
  confidence: 'high' | 'medium' | 'low';
};

export type AIMemoryUpdate = {
  key: string;
  value: string;
  reason: string;
};

export type AIArtifact =
  | {
      type: 'sql';
      title: string;
      sql: string;
      dialect?: string | null;
      description?: string | null;
    }
  | {
      type: 'migration';
      title: string;
      sql: string;
      dialect?: string | null;
      notes?: string | null;
    }
  | {
      type: 'index_advice';
      title: string;
      content: string;
      ddl?: string | null;
      riskLevel?: 'safe' | 'medium' | 'dangerous' | null;
    }
  | {
      type: 'explanation';
      title: string;
      content: string;
    }
  | {
      type: 'query_history_matches';
      title: string;
      items: AIQueryHistoryItem[];
    };

export type AIToolProposalPayload = {
  id: string;
  toolName: AIToolName;
  status: AIToolProposalStatus;
  reason: string;
  confirmationLabel: string;
  arguments: Record<string, unknown>;
  result?: Record<string, unknown> | null;
};

export type AIThreadSummary = {
  id: string;
  workspaceId: string;
  connectionId: string;
  title: string | null;
  provider: string | null;
  model: string | null;
  status: AIThreadStatus;
  createdAt: string;
  updatedAt: string;
};

export type AIStoredMessage = {
  id: string;
  threadId: string;
  role: AIMessageRole;
  intent: string | null;
  content: string;
  artifacts: AIArtifact[];
  toolProposals: AIToolProposalPayload[];
  citations: AICitation[];
  createdAt: string;
};

export type AIThreadDetail = {
  thread: AIThreadSummary;
  memory: {
    summary: string;
    facts: AIMemoryFact[];
    updatedAt: string | null;
  } | null;
  messages: AIStoredMessage[];
};

import type { AIIntent } from '@/shared/ai/intent-classifier';

export type AIProviderName =
  'openai' | 'deepseek' | 'anthropic' | 'google' | 'xai' | 'moonshot' | 'zhipu';

export type AIModelOption = {
  id: string;
  label: string;
  apiModel: string;
  provider: AIProviderName;
};

export type AIMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type AIChatInput = {
  model: string;
  messages: AIMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  metadata?: Record<string, unknown>;
};

export type AIChatResult = {
  text: string;
  model: string;
  provider: AIProviderName;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  raw?: unknown;
};

export type AIStreamChunk = {
  type: 'token' | 'metadata' | 'done' | 'error';
  text?: string;
  metadata?: Record<string, unknown>;
  error?: string;
};

export type UserPlan = 'FREE' | 'ULTIMATE';

export type ModelRouteInput = {
  userPlan: UserPlan;
  intent: AIIntent;
  estimatedInputTokens: number;
  requestedProvider?: AIProviderName;
  requestedModel?: string;
  requiresToolUse?: boolean;
  requiresLongContext?: boolean;
  requiresHighAccuracy?: boolean;
};

export type ModelRouteResult = {
  provider: AIProviderName;
  model: string;
  maxContextTokens: number;
  maxOutputTokens: number;
};

export type AIProviderCatalogEntry = {
  name: AIProviderName;
  label: string;
  configured: boolean;
  models: string[];
  modelOptions: AIModelOption[];
  defaultModel: string | null;
};
