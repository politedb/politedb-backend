import crypto from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import type {
  AICreateSnippetInput,
  AICreateThreadInput,
  AIIndexDocsPayloadInput,
  AIIndexQueryHistoryPayloadInput,
  AIIndexSchemaPayloadInput,
  AIIndexScopeInput,
  AITurnRequestInput,
} from '@/common/validations/ai.validation';
import { AnthropicProvider } from '@/common/integrations/ai/anthropic.provider';
import { OpenAICompatibleProvider } from '@/common/integrations/ai/openai.provider';
import type { AIProvider } from '@/common/integrations/ai/ai.provider';
import type { AIProviderName, AIStreamChunk, ModelRouteResult, UserPlan } from '@/types';
import { AIIntent, detectIntent, type IntentDetectionResult } from '@/shared/ai/intent-classifier';
import { ModelRouterService } from '@/shared/ai/model-router';
import { calculateCost } from '@/shared/ai/cost-calculator';
import { AIQuotaExceededError, QuotaService } from '@/shared/ai/quota';
import { UsageTrackerService } from '@/shared/ai/usage-tracker';
import { PromptBuilderService } from '@/shared/ai/prompt-builder';
import { env } from '@/config/env';
import { listConfiguredProviders } from '@/common/integrations/ai/provider-registry';
import { ContextBuilderService } from '@/shared/ai/context-builder';
import { retrieveDocs } from '@/shared/ai/docs-retriever';
import { ToolExecutorService } from '@/shared/ai/tool-executor';
import { ScopedMemoryService } from '@/shared/ai/scoped-memory-store';
import { AISnippetService } from '@/shared/ai/snippet-store';
import { AIThreadService } from '@/shared/ai/thread-store';
import { ToolProposalService } from '@/shared/ai/tool-proposal-store';
import { RagRetrievalService } from '@/shared/ai/rag-retrieval';
import { ContextBudgetService } from '@/shared/ai/context-budget';
import { SchemaIndexService } from '@/shared/ai/schema-index-store';
import type {
  AIArtifact,
  AICitation,
  AIMemoryUpdate,
  AIStoredMessage,
  AIToolProposalPayload,
} from '@/types';

export type AiRequestContext = {
  userId: string;
  workspaceId?: string | null;
  plan: UserPlan;
};

export type AiHttpErrorResponse = {
  status: number;
  body: {
    code: string;
    message: string;
    upgradeRequired?: boolean;
  };
};

export function aiPlanFromHeader(value: unknown): UserPlan {
  const plan = String(value ?? 'FREE')
    .trim()
    .toUpperCase();
  return plan === 'ULTIMATE' ? plan : 'FREE';
}

export function createAiRequestContext(headers: IncomingHttpHeaders): AiRequestContext {
  return {
    userId: String(headers['x-user-id'] ?? 'anonymous').trim() || 'anonymous',
    workspaceId: typeof headers['x-workspace-id'] === 'string' ? headers['x-workspace-id'] : null,
    plan: aiPlanFromHeader(headers['x-user-plan']),
  };
}

export function getAiHttpErrorResponse(error: unknown): AiHttpErrorResponse {
  if (isAiQuotaError(error)) {
    return {
      status: 429,
      body: {
        code: 'AI_QUOTA_EXCEEDED',
        message: 'You have reached your AI usage limit.',
        upgradeRequired: true,
      },
    };
  }

  const code = error instanceof Error ? error.message : 'AI_REQUEST_FAILED';
  const explicitStatus: Record<string, number> = {
    AI_MODEL_NOT_SUPPORTED: 400,
    AI_PROVIDER_NOT_CONFIGURED: 503,
    AI_THREAD_NOT_FOUND: 404,
    AI_THREAD_SCOPE_MISMATCH: 409,
    AI_SNIPPET_NOT_FOUND: 404,
    AI_TOOL_PROPOSAL_NOT_FOUND: 404,
    AI_TOOL_PROPOSAL_EXPIRED: 410,
    AI_TOOL_PROPOSAL_ALREADY_RESOLVED: 409,
    AI_INDEXING_NOT_ENABLED: 409,
    AI_EMBEDDING_PROVIDER_NOT_CONFIGURED: 503,
  };

  return {
    status: explicitStatus[code] ?? 502,
    body: {
      code,
      message:
        code === 'AI_PROVIDER_NOT_CONFIGURED'
          ? 'The selected AI provider is not configured on the server.'
          : code === 'AI_MODEL_NOT_SUPPORTED'
            ? 'The selected AI model is not available.'
            : 'AI request failed. Please try again later.',
    },
  };
}

type AssistantTurnResponse = {
  requestId: string;
  threadId: string;
  provider: string;
  model: string;
  intent: AIIntent;
  secondaryIntents: AIIntent[];
  assistantMessage: AIStoredMessage;
  artifacts: AIArtifact[];
  toolProposals: AIToolProposalPayload[];
  memoryUpdates: AIMemoryUpdate[];
  citations: AICitation[];
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  cacheHit: false;
};

class AIService {
  private providerMap: Partial<Record<AIProviderName, AIProvider>> = {
    openai: new OpenAICompatibleProvider({
      name: 'openai',
      apiKey: env.openAiApiKey,
      baseUrl: env.openAiBaseUrl,
    }),
    deepseek: new OpenAICompatibleProvider({
      name: 'deepseek',
      apiKey: env.deepSeekApiKey,
      baseUrl: env.deepSeekBaseUrl,
    }),
    anthropic: new AnthropicProvider({
      apiKey: env.anthropicApiKey,
      baseUrl: env.anthropicBaseUrl,
    }),
    google: new OpenAICompatibleProvider({
      name: 'google',
      apiKey: env.googleApiKey,
      baseUrl: env.googleBaseUrl,
    }),
    xai: new OpenAICompatibleProvider({
      name: 'xai',
      apiKey: env.xaiApiKey,
      baseUrl: env.xaiBaseUrl,
    }),
    moonshot: new OpenAICompatibleProvider({
      name: 'moonshot',
      apiKey: env.moonshotApiKey,
      baseUrl: env.moonshotBaseUrl,
    }),
    zhipu: new OpenAICompatibleProvider({
      name: 'zhipu',
      apiKey: env.zhipuApiKey,
      baseUrl: env.zhipuBaseUrl,
    }),
  };
  private modelRouter = new ModelRouterService();
  private contextBuilder = new ContextBuilderService();
  private promptBuilder = new PromptBuilderService();
  private usageTracker = new UsageTrackerService();
  private quotaService = new QuotaService();
  private threadStore = new AIThreadService();
  private memoryStore = new ScopedMemoryService();
  private snippetStore = new AISnippetService();
  private toolProposalStore = new ToolProposalService();
  private toolExecutorService = new ToolExecutorService({ providers: this.providerMap });
  private ragRetrieval = new RagRetrievalService();
  private contextBudget = new ContextBudgetService();
  private schemaIndex = new SchemaIndexService();

  async createThread(input: AICreateThreadInput) {
    return this.threadStore.createOrResume(input);
  }

  async getThread(threadId: string) {
    const thread = await this.threadStore.getThreadSummary(threadId);
    const memory = await this.memoryStore.get({
      workspaceId: thread.workspaceId,
      connectionId: thread.connectionId,
    });
    return this.threadStore.getThread(threadId, memory);
  }

  async createSnippet(input: AICreateSnippetInput, context: AiRequestContext) {
    return this.snippetStore.create({
      ...input,
      createdByUserId: context.userId,
    });
  }

  async listSnippets(workspaceId: string, connectionId: string) {
    return this.snippetStore.list(workspaceId, connectionId);
  }

  async getSnippet(snippetId: string) {
    return this.snippetStore.get(snippetId);
  }

  async enableIndex(connectionId: string, input: AIIndexScopeInput) {
    return this.schemaIndex.enable({ ...input, connectionId });
  }

  async disableIndex(connectionId: string, input: AIIndexScopeInput) {
    return this.schemaIndex.disable({ ...input, connectionId });
  }

  async indexStatus(connectionId: string, input: AIIndexScopeInput) {
    return this.schemaIndex.status({ ...input, connectionId });
  }

  async clearIndex(connectionId: string, input: AIIndexScopeInput) {
    return this.schemaIndex.clear({ ...input, connectionId });
  }

  async indexSchema(input: AIIndexSchemaPayloadInput) {
    return this.schemaIndex.indexSchema(input);
  }

  async indexQueryHistory(input: AIIndexQueryHistoryPayloadInput) {
    return this.schemaIndex.indexQueryHistory(input);
  }

  async indexDocs(input: AIIndexDocsPayloadInput) {
    return this.schemaIndex.indexDocs(input);
  }

  async confirmToolProposal(proposalId: string, _input: { confirmedByUserId?: string }) {
    const proposal = await this.toolProposalStore.getProposal(proposalId);
    const thread = await this.threadStore.getThreadSummary(proposal.threadId);
    const provider = (thread.provider ?? env.aiDefaultProvider) as AIProviderName;
    const model = thread.model ?? this.models('FREE').defaultModel ?? env.aiDefaultFreeModel;

    const execution = await this.toolExecutorService.confirmAndExecute(proposalId, {
      provider,
      model,
    });
    const result = execution.result;

    const toolMessage = await this.threadStore.appendMessage({
      threadId: proposal.threadId,
      role: 'tool',
      intent: proposal.toolName,
      content: `Executed tool ${proposal.toolName}.`,
      artifacts: [
        {
          type: 'explanation',
          title: `Tool result: ${proposal.toolName}`,
          content: JSON.stringify(result, null, 2),
        },
      ],
    });

    return {
      proposal: this.toolProposalStore.toPayload(execution.proposal),
      result,
      toolMessage,
    };
  }

  async sendMessage(
    threadId: string,
    payload: AITurnRequestInput,
    context: AiRequestContext,
  ): Promise<AssistantTurnResponse> {
    const requestId = crypto.randomUUID();
    const thread = await this.threadStore.getThreadSummary(threadId);
    this.assertThreadScope(thread, payload);

    const detection = detectIntent(payload.userMessage, payload.intent);
    const builtContext = this.contextBuilder.build(payload, context.plan);
    const route = this.routeModel(payload, context.plan, detection);
    const memory = await this.memoryStore.get({
      workspaceId: payload.workspaceId,
      connectionId: payload.connectionId,
    });
    const recentMessages = await this.threadStore.listRecentMessages(threadId);
    const citations = this.contextBudget.mergeCitations({
      rag: await this.safeRetrieveRag(payload),
      docs: retrieveDocs(payload.userMessage, builtContext.docsContext),
    });
    const usage = await this.usageTracker.snapshot(context.userId, context.plan);
    this.applyQuotaLimits(usage, context.plan);
    await this.assertAllowed(context, usage, detection, route, payload);

    const userMessage = await this.threadStore.appendMessage({
      threadId,
      role: 'user',
      intent: detection.primaryIntent,
      content: payload.userMessage,
    });

    const provider = this.providerFor(route.provider);
    const promptMessages = this.promptBuilder.build({
      intent: detection.primaryIntent,
      userMessage: payload.userMessage,
      context: builtContext,
      recentMessages,
      memory,
      citations,
    });

    const result = await provider.chat({
      model: route.model,
      messages: promptMessages,
      temperature: 0.2,
      maxOutputTokens: route.maxOutputTokens,
      metadata: { requestId, threadId },
    });

    const artifacts = this.extractArtifacts({
      intent: detection.primaryIntent,
      text: result.text,
      payload,
    });
    const proposalDrafts = this.toolProposalStore.build({
      threadId,
      messageId: userMessage.id,
      intent: detection.primaryIntent,
      userMessage: payload.userMessage,
      allowedTools: payload.allowedTools,
      context: builtContext,
    });
    const persistedProposals = await this.toolProposalStore.persist(
      proposalDrafts.map((proposal) => ({
        threadId,
        messageId: userMessage.id,
        toolName: proposal.toolName,
        reason: proposal.reason,
        confirmationLabel: proposal.confirmationLabel,
        arguments: proposal.arguments,
      })),
    );

    const assistantMessage = await this.threadStore.appendMessage({
      threadId,
      role: 'assistant',
      intent: detection.primaryIntent,
      content: result.text,
      artifacts,
      toolProposals: persistedProposals,
      citations,
    });

    const memoryUpdates = await this.memoryStore.update(
      {
        workspaceId: payload.workspaceId,
        connectionId: payload.connectionId,
      },
      {
        intent: detection.primaryIntent,
        userMessage: payload.userMessage,
        provider: route.provider,
        model: route.model,
        activeDatabase: payload.editorContext?.activeDatabase ?? null,
        activeSchema: payload.editorContext?.activeSchema ?? null,
        activeTable: payload.editorContext?.activeTable ?? null,
      },
    );

    const estimatedCost = calculateCost({
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    });
    await this.usageTracker.log({
      userId: context.userId,
      workspaceId: payload.workspaceId,
      connectionId: payload.connectionId,
      provider: result.provider,
      model: result.model,
      intent: detection.primaryIntent,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      estimatedCost,
      latencyMs: result.latencyMs,
      cacheHit: false,
      status: 'success',
    });

    return {
      requestId,
      threadId,
      provider: result.provider,
      model: result.model,
      intent: detection.primaryIntent,
      secondaryIntents: detection.secondaryIntents,
      assistantMessage,
      artifacts,
      toolProposals: persistedProposals,
      memoryUpdates,
      citations,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      estimatedCost,
      cacheHit: false,
    };
  }

  async *streamMessage(
    threadId: string,
    payload: AITurnRequestInput,
    context: AiRequestContext,
  ): AsyncIterable<AIStreamChunk> {
    const requestId = crypto.randomUUID();
    const thread = await this.threadStore.getThreadSummary(threadId);
    this.assertThreadScope(thread, payload);

    const detection = detectIntent(payload.userMessage, payload.intent);
    const builtContext = this.contextBuilder.build(payload, context.plan);
    const route = this.routeModel(payload, context.plan, detection);
    const memory = await this.memoryStore.get({
      workspaceId: payload.workspaceId,
      connectionId: payload.connectionId,
    });
    const recentMessages = await this.threadStore.listRecentMessages(threadId);
    const citations = this.contextBudget.mergeCitations({
      rag: await this.safeRetrieveRag(payload),
      docs: retrieveDocs(payload.userMessage, builtContext.docsContext),
    });
    const usage = await this.usageTracker.snapshot(context.userId, context.plan);
    this.applyQuotaLimits(usage, context.plan);
    await this.assertAllowed(context, usage, detection, route, payload);

    const userMessage = await this.threadStore.appendMessage({
      threadId,
      role: 'user',
      intent: detection.primaryIntent,
      content: payload.userMessage,
    });
    const provider = this.providerFor(route.provider);
    const promptMessages = this.promptBuilder.build({
      intent: detection.primaryIntent,
      userMessage: payload.userMessage,
      context: builtContext,
      recentMessages,
      memory,
      citations,
    });

    yield {
      type: 'metadata',
      metadata: {
        requestId,
        threadId,
        provider: route.provider,
        model: route.model,
        intent: detection.primaryIntent,
      },
    };

    let text = '';
    for await (const chunk of provider.streamChat({
      model: route.model,
      messages: promptMessages,
      temperature: 0.2,
      maxOutputTokens: route.maxOutputTokens,
      metadata: { requestId, threadId },
    })) {
      if (chunk.type === 'error') {
        throw new Error(chunk.error ?? 'AI_PROVIDER_STREAM_FAILED');
      }
      if (chunk.type === 'token' && chunk.text) {
        text += chunk.text;
      }
      yield chunk;
    }

    const artifacts = this.extractArtifacts({
      intent: detection.primaryIntent,
      text,
      payload,
    });
    const proposalDrafts = this.toolProposalStore.build({
      threadId,
      messageId: userMessage.id,
      intent: detection.primaryIntent,
      userMessage: payload.userMessage,
      allowedTools: payload.allowedTools,
      context: builtContext,
    });
    const persistedProposals = await this.toolProposalStore.persist(
      proposalDrafts.map((proposal) => ({
        threadId,
        messageId: userMessage.id,
        toolName: proposal.toolName,
        reason: proposal.reason,
        confirmationLabel: proposal.confirmationLabel,
        arguments: proposal.arguments,
      })),
    );

    const assistantMessage = await this.threadStore.appendMessage({
      threadId,
      role: 'assistant',
      intent: detection.primaryIntent,
      content: text,
      artifacts,
      toolProposals: persistedProposals,
      citations,
    });

    const memoryUpdates = await this.memoryStore.update(
      {
        workspaceId: payload.workspaceId,
        connectionId: payload.connectionId,
      },
      {
        intent: detection.primaryIntent,
        userMessage: payload.userMessage,
        provider: route.provider,
        model: route.model,
        activeDatabase: payload.editorContext?.activeDatabase ?? null,
        activeSchema: payload.editorContext?.activeSchema ?? null,
        activeTable: payload.editorContext?.activeTable ?? null,
      },
    );

    const inputTokens = this.estimateTokens(
      promptMessages.map((message) => message.content).join('\n'),
    );
    const outputTokens = this.estimateTokens(text);
    const estimatedCost = calculateCost({
      model: route.model,
      inputTokens,
      outputTokens,
    });
    await this.usageTracker.log({
      userId: context.userId,
      workspaceId: payload.workspaceId,
      connectionId: payload.connectionId,
      provider: route.provider,
      model: route.model,
      intent: detection.primaryIntent,
      inputTokens,
      outputTokens,
      estimatedCost,
      latencyMs: 0,
      cacheHit: false,
      status: 'success',
    });

    yield {
      type: 'done',
      metadata: {
        requestId,
        threadId,
        assistantMessageId: assistantMessage.id,
        artifacts,
        citations,
        toolProposals: persistedProposals,
        memoryUpdates,
      },
    };
  }

  async usage(context: AiRequestContext) {
    const snapshot = await this.usageTracker.snapshot(context.userId, context.plan);
    this.applyQuotaLimits(snapshot, context.plan);
    return {
      ...snapshot,
      estimatedCost: await this.usageTracker.totalCost(context.userId),
    };
  }

  models(plan: UserPlan) {
    const quota = this.quotaService.limitsFor(plan);
    const configuredProviders = listConfiguredProviders();
    const route = configuredProviders.length
      ? this.modelRouter.route({
          userPlan: plan,
          intent: AIIntent.GENERAL_CHAT,
          estimatedInputTokens: 0,
        })
      : null;

    return {
      defaultProvider: route?.provider ?? null,
      defaultModel: route?.model ?? null,
      dailyRequestsLimit: quota.dailyRequests,
      dailyTokensLimit: quota.dailyTokens,
      providers: configuredProviders.map((provider) => ({
        provider: provider.name,
        label: provider.label,
        defaultModel: provider.defaultModel,
        models: provider.models,
        modelOptions: provider.modelOptions,
      })),
      supportedTools: [
        'open_table',
        'create_tab',
        'export_csv',
        'explain_index',
        'generate_migration',
      ],
    };
  }

  isQuotaError(error: unknown) {
    return error instanceof AIQuotaExceededError;
  }

  private providerFor(name: AIProviderName) {
    const provider = this.providerMap[name];
    if (!provider) {
      throw new Error('AI_PROVIDER_NOT_SUPPORTED');
    }
    return provider;
  }

  private assertThreadScope(
    thread: { workspaceId: string; connectionId: string },
    payload: { workspaceId: string; connectionId: string },
  ) {
    if (
      thread.workspaceId !== payload.workspaceId ||
      thread.connectionId !== payload.connectionId
    ) {
      throw new Error('AI_THREAD_SCOPE_MISMATCH');
    }
  }

  private routeModel(
    payload: AITurnRequestInput,
    plan: UserPlan,
    detection: IntentDetectionResult,
  ) {
    return this.modelRouter.route({
      userPlan: plan,
      intent: detection.primaryIntent,
      estimatedInputTokens: this.estimateTokens(payload.userMessage),
      requestedProvider: payload.provider,
      requestedModel: payload.model,
    });
  }

  private async assertAllowed(
    context: AiRequestContext,
    usage: Awaited<ReturnType<UsageTrackerService['snapshot']>>,
    detection: IntentDetectionResult,
    route: ModelRouteResult,
    payload: AITurnRequestInput,
  ) {
    try {
      await this.quotaService.assertAllowed({ plan: context.plan, usage });
    } catch (error) {
      await this.logQuotaExceeded(
        context,
        payload,
        detection.primaryIntent,
        route.provider,
        route.model,
      );
      throw error;
    }
  }

  private estimateTokens(text: string) {
    return Math.ceil(text.length / 4);
  }

  private async safeRetrieveRag(payload: AITurnRequestInput): Promise<AICitation[]> {
    try {
      const query = [
        payload.userMessage,
        payload.editorContext?.selectedSql,
        payload.editorContext?.currentSql,
        payload.editorContext?.activeTable,
      ]
        .filter(Boolean)
        .join('\n');
      return await this.ragRetrieval.retrieve({
        workspaceId: payload.workspaceId,
        connectionId: payload.connectionId,
        databaseName: payload.editorContext?.activeDatabase ?? null,
        schemaName: payload.editorContext?.activeSchema ?? null,
        query,
        limit: 6,
      });
    } catch {
      return [];
    }
  }

  private extractArtifacts(input: {
    intent: AIIntent;
    text: string;
    payload: AITurnRequestInput;
  }): AIArtifact[] {
    const sqlBlocks = this.extractSqlBlocks(input.text);

    switch (input.intent) {
      case AIIntent.GENERATE_SQL:
        return sqlBlocks.length
          ? [
              {
                type: 'sql',
                title: 'Generated SQL',
                sql: sqlBlocks[0],
                dialect: input.payload.editorContext?.activeDatabase ?? null,
                description: 'SQL generated from the supplied schema and request.',
              },
            ]
          : [];
      case AIIntent.TOOL_GENERATE_MIGRATION:
        return sqlBlocks.length
          ? [
              {
                type: 'migration',
                title: 'Migration draft',
                sql: sqlBlocks[0],
                dialect: input.payload.editorContext?.activeDatabase ?? null,
                notes: 'Draft migration SQL requires review before use.',
              },
            ]
          : [];
      case AIIntent.SEARCH_QUERY_HISTORY:
        return input.payload.queryHistory.length
          ? [
              {
                type: 'query_history_matches',
                title: 'Relevant query history',
                items: input.payload.queryHistory.slice(0, 5),
              },
            ]
          : [];
      case AIIntent.OPTIMIZE_SQL:
        return [
          {
            type: 'index_advice',
            title: 'Index and query advice',
            content: input.text,
            ddl: sqlBlocks[0] ?? null,
            riskLevel: sqlBlocks.length ? 'medium' : 'safe',
          },
        ];
      case AIIntent.EXPLAIN_SQL_ERROR:
      case AIIntent.EXPLAIN_QUERY_RESULT:
      case AIIntent.ASK_SCHEMA:
      case AIIntent.RETRIEVE_DOCS:
        return [
          {
            type: 'explanation',
            title: 'Assistant explanation',
            content: input.text,
          },
        ];
      default:
        return [];
    }
  }

  private extractSqlBlocks(text: string) {
    const matches = Array.from(text.matchAll(/```sql\s*([\s\S]*?)```/gi));
    if (matches.length) {
      return matches.map((match) => match[1].trim()).filter(Boolean);
    }

    try {
      const parsed = JSON.parse(text.trim());
      const sql = typeof parsed?.sql === 'string' ? parsed.sql.trim() : '';
      if (sql) return [sql];
    } catch {}

    if (/^\s*(select|insert|update|delete|with|create|alter|drop)\b/i.test(text.trim())) {
      return [text.trim()];
    }

    return [];
  }

  private applyQuotaLimits(
    usage: Awaited<ReturnType<UsageTrackerService['snapshot']>>,
    plan: UserPlan,
  ) {
    const quota = this.quotaService.limitsFor(plan);
    usage.dailyRequestsLimit = quota.dailyRequests;
    usage.monthlyRequestsLimit = quota.monthlyRequests;
    usage.dailyTokensLimit = quota.dailyTokens;
    usage.monthlyTokensLimit = quota.monthlyTokens;
  }

  private async logQuotaExceeded(
    context: AiRequestContext,
    payload: { connectionId?: string; workspaceId: string },
    intent: AIIntent,
    provider: AIProviderName,
    model: string,
  ) {
    await this.usageTracker.log({
      userId: context.userId,
      workspaceId: payload.workspaceId,
      connectionId: payload.connectionId ?? null,
      provider,
      model,
      intent,
      status: 'quota_exceeded',
      errorMessage: 'You have reached your AI usage limit.',
    });
  }
}

const aiService = new AIService();

export function isAiQuotaError(error: unknown) {
  return aiService.isQuotaError(error);
}

export async function createAiThread(input: AICreateThreadInput) {
  return aiService.createThread(input);
}

export async function getAiThread(threadId: string) {
  return aiService.getThread(threadId);
}

export async function sendAiMessage(
  threadId: string,
  payload: AITurnRequestInput,
  context: AiRequestContext,
) {
  return aiService.sendMessage(threadId, payload, context);
}

export function streamAiMessage(
  threadId: string,
  payload: AITurnRequestInput,
  context: AiRequestContext,
) {
  return aiService.streamMessage(threadId, payload, context);
}

export async function confirmAiToolProposal(
  proposalId: string,
  input: { confirmedByUserId?: string },
) {
  return aiService.confirmToolProposal(proposalId, input);
}

export function listAiModels(plan: UserPlan) {
  return aiService.models(plan);
}

export async function getAiUsage(context: AiRequestContext) {
  return aiService.usage(context);
}

export async function enableAiIndex(connectionId: string, input: AIIndexScopeInput) {
  return aiService.enableIndex(connectionId, input);
}

export async function disableAiIndex(connectionId: string, input: AIIndexScopeInput) {
  return aiService.disableIndex(connectionId, input);
}

export async function getAiIndexStatus(connectionId: string, input: AIIndexScopeInput) {
  return aiService.indexStatus(connectionId, input);
}

export async function clearAiIndex(connectionId: string, input: AIIndexScopeInput) {
  return aiService.clearIndex(connectionId, input);
}

export async function indexAiSchema(input: AIIndexSchemaPayloadInput) {
  return aiService.indexSchema(input);
}

export async function indexAiQueryHistory(input: AIIndexQueryHistoryPayloadInput) {
  return aiService.indexQueryHistory(input);
}

export async function indexAiDocs(input: AIIndexDocsPayloadInput) {
  return aiService.indexDocs(input);
}

export async function createAiSnippet(input: AICreateSnippetInput, context: AiRequestContext) {
  return aiService.createSnippet(input, context);
}

export async function listAiSnippets(workspaceId: string, connectionId: string) {
  return aiService.listSnippets(workspaceId, connectionId);
}

export async function getAiSnippet(snippetId: string) {
  return aiService.getSnippet(snippetId);
}
