import type { BuiltAIContext } from './context-builder';
import type { AICitation, AIMemoryFact, AIStoredMessage } from '@/types';
import { AIIntent } from './intent-classifier';
import { POLITEDB_AI_SYSTEM_PROMPT, SQL_GENERATION_JSON_INSTRUCTION } from './prompts';
import type { AIMessage } from '@/types';

type PromptInput = {
  intent: AIIntent;
  userMessage: string;
  context: BuiltAIContext;
  recentMessages: AIStoredMessage[];
  memory: { summary: string; facts: AIMemoryFact[] } | null;
  citations: AICitation[];
};

const INTENT_INSTRUCTIONS: Record<AIIntent, string> = {
  [AIIntent.GENERAL_CHAT]:
    'Help the user inside PoliteDB. Answer directly and stay grounded in the supplied context.',
  [AIIntent.CLASSIFY_ONLY]: 'Briefly classify the request and explain the likely next action.',
  [AIIntent.GENERATE_SQL]: `Generate SQL that matches the provided schema and database dialect.${SQL_GENERATION_JSON_INSTRUCTION}`,
  [AIIntent.CONFIRM_BEFORE_RUN]:
    'Do not imply that any SQL or action has been executed. Ask for confirmation before anything run-like.',
  [AIIntent.EXPLAIN_SQL_ERROR]:
    'Explain the SQL error clearly, identify the likely cause, and provide a corrected query if possible.',
  [AIIntent.ASK_SCHEMA]: 'Answer the schema question using only supplied schema context.',
  [AIIntent.OPTIMIZE_SQL]:
    'Optimize the SQL, explain the bottlenecks, and suggest indexes or rewrites when justified.',
  [AIIntent.EXPLAIN_QUERY_RESULT]:
    'Explain what the query result means using the supplied result context.',
  [AIIntent.SAVE_SQL_SUGGESTION]:
    'Prepare the SQL suggestion so it can be saved as a reusable snippet.',
  [AIIntent.RETRIEVE_DOCS]:
    'Answer from PoliteDB docs fragments when they are relevant. Cite docs content naturally.',
  [AIIntent.SEARCH_QUERY_HISTORY]:
    'Search the supplied query history and summarize the most relevant prior queries.',
  [AIIntent.USE_MEMORY]:
    'Use scoped memory when relevant, but do not invent facts not present in memory.',
  [AIIntent.TOOL_OPEN_TABLE]:
    'Explain that opening the table requires confirmation and keep the explanation concise.',
  [AIIntent.TOOL_CREATE_TAB]:
    'Explain that creating a new tab requires confirmation and keep the explanation concise.',
  [AIIntent.TOOL_EXPORT_CSV]:
    'Explain that exporting CSV requires confirmation and keep the explanation concise.',
  [AIIntent.TOOL_EXPLAIN_INDEX]: 'Explain that index analysis will be prepared after confirmation.',
  [AIIntent.TOOL_GENERATE_MIGRATION]:
    'Explain that a migration draft can be generated after confirmation.',
};

export class PromptBuilderService {
  build(input: PromptInput): AIMessage[] {
    const messages: AIMessage[] = [
      {
        role: 'system',
        content: this.systemPrompt(input.intent),
      },
      {
        role: 'system',
        content: this.buildMemorySection(input.memory),
      },
      {
        role: 'system',
        content: this.buildContextSection(input.context, input.citations),
      },
      ...this.buildHistory(input.recentMessages),
      {
        role: 'user',
        content: input.userMessage,
      },
    ];

    return messages.filter((message) => message.content.trim().length > 0);
  }

  private systemPrompt(intent: AIIntent) {
    return `${POLITEDB_AI_SYSTEM_PROMPT}\n\nIntent instruction: ${INTENT_INSTRUCTIONS[intent]}`;
  }

  private buildMemorySection(memory: { summary: string; facts: AIMemoryFact[] } | null) {
    if (!memory) {
      return '';
    }

    const facts = memory.facts.map((fact) => `${fact.key}: ${fact.value}`).join('\n');
    return `Scoped memory summary:\n${memory.summary}\n\nScoped memory facts:\n${facts}`;
  }

  private buildContextSection(context: BuiltAIContext, citations: AICitation[]) {
    const docs = citations.length
      ? `Relevant PoliteDB docs:\n${citations
          .map(
            (citation, index) =>
              `${index + 1}. [${citation.sourceId}] ${citation.title ?? citation.path ?? 'Untitled'}\n${citation.snippet}`,
          )
          .join('\n\n')}`
      : '';

    return [context.contextText, docs].filter(Boolean).join('\n\n');
  }

  private buildHistory(messages: AIStoredMessage[]) {
    return messages.slice(-8).map((message): AIMessage => ({
      role: message.role === 'tool' ? 'assistant' : message.role,
      content: message.content,
    }));
  }
}
