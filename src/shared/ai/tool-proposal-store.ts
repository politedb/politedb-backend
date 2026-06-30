import { AiToolProposal } from '@/db/entities';
import { getEm } from '@/db/orm';
import { createId } from '@/utils/license-key';
import type { AIIntent } from './intent-classifier';
import type { BuiltAIContext } from './context-builder';
import type { AIToolName, AIToolProposalPayload } from '@/types';
import { parseJsonText, stringifyJson } from '@/utils/common';

type ProposalInput = {
  threadId: string;
  messageId: string;
  intent: AIIntent;
  userMessage: string;
  allowedTools: string[];
  context: BuiltAIContext;
};

export class ToolProposalService {
  build(input: ProposalInput) {
    const proposal = this.matchIntentToProposal(input);
    return proposal ? [proposal] : [];
  }

  async persist(
    payloads: Array<
      Omit<AIToolProposalPayload, 'id' | 'status'> & { threadId: string; messageId: string }
    >,
  ) {
    const em = getEm();
    const now = new Date();
    const rows: AiToolProposal[] = [];

    for (const payload of payloads) {
      const row = em.create(AiToolProposal, {
        id: createId(),
        threadId: payload.threadId,
        messageId: payload.messageId,
        toolName: payload.toolName,
        status: 'proposed',
        argumentsJson: stringifyJson(payload.arguments),
        resultJson: null,
        confirmationText: payload.confirmationLabel,
        expiresAt: new Date(now.getTime() + 1000 * 60 * 60 * 24),
        createdAt: now,
        updatedAt: now,
      });
      rows.push(row);
      em.persist(row);
    }

    await em.flush();

    return rows.map((row) => this.toPayload(row));
  }

  async getProposal(proposalId: string) {
    const em = getEm();
    const row = await em.findOne(AiToolProposal, { id: proposalId });
    if (!row) {
      throw new Error('AI_TOOL_PROPOSAL_NOT_FOUND');
    }
    return row;
  }

  toPayload(row: AiToolProposal): AIToolProposalPayload {
    return {
      id: row.id,
      toolName: row.toolName as AIToolName,
      status: row.status as AIToolProposalPayload['status'],
      reason: `Confirmation required for ${row.toolName}.`,
      confirmationLabel: row.confirmationText,
      arguments: parseJsonText<Record<string, unknown>>(row.argumentsJson, {}),
      result: parseJsonText<Record<string, unknown> | null>(row.resultJson, null),
    };
  }

  private matchIntentToProposal(input: ProposalInput) {
    const canUse = (toolName: string) =>
      !input.allowedTools.length || input.allowedTools.includes(toolName);
    const tableName =
      input.context.editorContext.activeTable ??
      this.findTableNameInMessage(input.userMessage, input.context);

    switch (input.intent) {
      case 'tool_open_table':
        if (!canUse('open_table') || !tableName) return null;
        return this.createPayload('open_table', input, {
          tableName,
          schema: input.context.editorContext.activeSchema ?? null,
        });
      case 'tool_create_tab':
        if (!canUse('create_tab')) return null;
        return this.createPayload('create_tab', input, {
          title: `AI ${input.intent}`,
          seedSql: input.context.editorContext.currentSql ?? '',
        });
      case 'tool_export_csv':
        if (!canUse('export_csv')) return null;
        return this.createPayload('export_csv', input, {
          activeTab: input.context.editorContext.activeTab ?? null,
          activeTable: tableName ?? null,
        });
      case 'tool_explain_index':
        if (!canUse('explain_index')) return null;
        return this.createPayload('explain_index', input, {
          userMessage: input.userMessage,
          schemaContext: input.context.schemaContext,
          editorContext: input.context.editorContext,
        });
      case 'tool_generate_migration':
        if (!canUse('generate_migration')) return null;
        return this.createPayload('generate_migration', input, {
          userMessage: input.userMessage,
          schemaContext: input.context.schemaContext,
          editorContext: input.context.editorContext,
        });
      default:
        return null;
    }
  }

  private createPayload(toolName: AIToolName, input: ProposalInput, args: Record<string, unknown>) {
    return {
      id: '',
      threadId: input.threadId,
      messageId: input.messageId,
      toolName,
      reason: `The request maps to the ${toolName} tool and requires confirmation before execution.`,
      confirmationLabel: `Confirm ${toolName.replace(/_/g, ' ')}`,
      arguments: args,
    };
  }

  private findTableNameInMessage(message: string, context: BuiltAIContext) {
    const lowered = message.toLowerCase();
    return (
      context.schemaContext.tables.find((table) => lowered.includes(table.name.toLowerCase()))
        ?.name ?? null
    );
  }
}
