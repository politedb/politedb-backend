import { AiToolProposal } from '@/db/entities';
import { getEm } from '@/db/orm';
import type { AIProvider } from '@/common/integrations/ai/ai.provider';
import type { AIProviderName, AIToolName } from '@/types';
import { parseJsonText, stringifyJson } from '@/utils/common';

type ExecutorDeps = {
  providers: Partial<Record<AIProviderName, AIProvider>>;
};

type ToolExecutionContext = {
  provider: AIProviderName;
  model: string;
};

export class ToolExecutorService {
  constructor(private readonly deps: ExecutorDeps) {}

  async confirmAndExecute(proposalId: string, context: ToolExecutionContext) {
    const em = getEm();
    const proposal = await em.findOne(AiToolProposal, { id: proposalId });
    if (!proposal) {
      throw new Error('AI_TOOL_PROPOSAL_NOT_FOUND');
    }
    if (proposal.status !== 'proposed') {
      throw new Error('AI_TOOL_PROPOSAL_ALREADY_RESOLVED');
    }
    if (proposal.expiresAt.getTime() < Date.now()) {
      throw new Error('AI_TOOL_PROPOSAL_EXPIRED');
    }

    proposal.status = 'confirmed';
    proposal.updatedAt = new Date();
    await em.flush();

    try {
      const args = parseJsonText<Record<string, unknown>>(proposal.argumentsJson, {});
      const result = await this.execute(proposal.toolName as AIToolName, args, context);
      proposal.status = 'executed';
      proposal.resultJson = stringifyJson(result);
      proposal.updatedAt = new Date();
      await em.flush();
      return { proposal, result };
    } catch (error) {
      proposal.status = 'failed';
      proposal.resultJson = stringifyJson({
        error: error instanceof Error ? error.message : 'AI_TOOL_EXECUTION_FAILED',
      });
      proposal.updatedAt = new Date();
      await em.flush();
      throw error;
    }
  }

  private async execute(
    toolName: AIToolName,
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ) {
    switch (toolName) {
      case 'open_table':
        return {
          action: 'open_table',
          tableName: String(args.tableName ?? ''),
          schema: args.schema ?? null,
        };
      case 'create_tab':
        return {
          action: 'create_tab',
          title: String(args.title ?? 'New Query'),
          seedSql: String(args.seedSql ?? ''),
        };
      case 'export_csv':
        return {
          action: 'export_csv',
          activeTab: args.activeTab ?? null,
          activeTable: args.activeTable ?? null,
        };
      case 'explain_index':
        return await this.explainIndex(args);
      case 'generate_migration':
        return await this.generateMigration(args, context);
      default:
        throw new Error('AI_TOOL_NOT_SUPPORTED');
    }
  }

  private async explainIndex(args: Record<string, unknown>) {
    const schemaContext = args.schemaContext as {
      tables?: Array<{
        name: string;
        indexes?: Array<{ name: string; columns: string[]; unique?: boolean }>;
      }>;
    };
    const editorContext = args.editorContext as {
      activeTable?: string | null;
      currentSql?: string | null;
    };
    const activeTable = editorContext?.activeTable ?? null;
    const table =
      schemaContext?.tables?.find((item) => item.name === activeTable) ??
      schemaContext?.tables?.[0];
    const indexes = table?.indexes ?? [];

    return {
      type: 'index_explanation',
      tableName: table?.name ?? null,
      explanation: indexes.length
        ? `Relevant indexes on ${table?.name}: ${indexes
            .map(
              (index) =>
                `${index.name}(${index.columns.join(', ')})${index.unique ? ' unique' : ''}`,
            )
            .join(
              '; ',
            )}. Review the current SQL predicates and joins against these indexed columns.`
        : 'No visible indexes were supplied for this table. Provide schema indexes to explain index usage.',
      indexes,
    };
  }

  private async generateMigration(args: Record<string, unknown>, context: ToolExecutionContext) {
    const provider = this.deps.providers[context.provider];
    if (!provider) {
      throw new Error('AI_PROVIDER_NOT_SUPPORTED');
    }

    const schemaContext = JSON.stringify(args.schemaContext ?? {}, null, 2);
    const editorContext = JSON.stringify(args.editorContext ?? {}, null, 2);
    const userMessage = String(args.userMessage ?? '');

    const result = await provider.chat({
      model: context.model,
      temperature: 0.1,
      maxOutputTokens: 1200,
      messages: [
        {
          role: 'system',
          content:
            'You generate SQL migration drafts only. Return concise notes and a SQL migration enclosed in a ```sql``` code block. Do not claim to have executed anything.',
        },
        {
          role: 'user',
          content: `User request:\n${userMessage}\n\nSchema context:\n${schemaContext}\n\nEditor context:\n${editorContext}`,
        },
      ],
    });

    return {
      type: 'migration_draft',
      content: result.text,
    };
  }
}
