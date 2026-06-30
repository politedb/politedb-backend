import { AiScopedMemory } from '@/db/entities';
import { getEm } from '@/db/orm';
import { createId } from '@/utils/license-key';
import type { AIIntent } from './intent-classifier';
import type { AIMemoryFact, AIMemoryUpdate } from '@/types';
import { parseJsonText, stringifyJson } from '@/utils/common';

type MemoryScope = {
  workspaceId: string;
  connectionId: string;
};

export interface AIScopedMemoryStore {
  get(scope: MemoryScope): Promise<{
    summary: string;
    facts: AIMemoryFact[];
    updatedAt: string | null;
  } | null>;
  update(
    scope: MemoryScope,
    input: {
      intent: AIIntent;
      userMessage: string;
      provider?: string | null;
      model?: string | null;
      activeDatabase?: string | null;
      activeSchema?: string | null;
      activeTable?: string | null;
    },
  ): Promise<AIMemoryUpdate[]>;
}

export class ScopedMemoryService implements AIScopedMemoryStore {
  async get(scope: MemoryScope) {
    const em = getEm();
    const record = await em.findOne(AiScopedMemory, scope);
    if (!record) {
      return null;
    }

    return {
      summary: record.summary,
      facts: parseJsonText<AIMemoryFact[]>(record.factsJson, []),
      updatedAt: record.updatedAt?.toISOString() ?? null,
    };
  }

  async update(
    scope: MemoryScope,
    input: {
      intent: AIIntent;
      userMessage: string;
      provider?: string | null;
      model?: string | null;
      activeDatabase?: string | null;
      activeSchema?: string | null;
      activeTable?: string | null;
    },
  ) {
    const em = getEm();
    let record = await em.findOne(AiScopedMemory, scope);
    const now = new Date();
    const updates = this.buildUpdates(input);

    if (!record) {
      record = em.create(AiScopedMemory, {
        id: createId(),
        ...scope,
        summary: '',
        factsJson: '[]',
        lastRefreshedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      em.persist(record);
    }

    const existingFacts = parseJsonText<AIMemoryFact[]>(record.factsJson, []);
    const nextFacts = this.mergeFacts(existingFacts, updates);
    record.factsJson = stringifyJson(nextFacts);
    record.summary = this.buildSummary(nextFacts, input);
    record.lastRefreshedAt = now;
    record.updatedAt = now;
    await em.flush();

    return updates;
  }

  private buildUpdates(input: {
    intent: AIIntent;
    userMessage: string;
    provider?: string | null;
    model?: string | null;
    activeDatabase?: string | null;
    activeSchema?: string | null;
    activeTable?: string | null;
  }) {
    const updates: AIMemoryUpdate[] = [
      {
        key: 'last_intent',
        value: input.intent,
        reason: 'Track the most recent assistant capability used in this scope.',
      },
    ];

    if (input.activeDatabase) {
      updates.push({
        key: 'active_database',
        value: input.activeDatabase,
        reason: 'Remember the last active database for this scope.',
      });
    }

    if (input.activeSchema) {
      updates.push({
        key: 'active_schema',
        value: input.activeSchema,
        reason: 'Remember the last active schema for this scope.',
      });
    }

    if (input.activeTable) {
      updates.push({
        key: 'active_table',
        value: input.activeTable,
        reason: 'Remember the last active table for this scope.',
      });
    }

    if (input.provider) {
      updates.push({
        key: 'preferred_provider',
        value: input.provider,
        reason: 'Remember the selected provider for this scope.',
      });
    }

    if (input.model) {
      updates.push({
        key: 'preferred_model',
        value: input.model,
        reason: 'Remember the selected model for this scope.',
      });
    }

    return updates;
  }

  private mergeFacts(existingFacts: AIMemoryFact[], updates: AIMemoryUpdate[]) {
    const factMap = new Map(existingFacts.map((fact) => [fact.key, fact] as const));
    for (const update of updates) {
      factMap.set(update.key, {
        key: update.key,
        value: update.value,
        confidence: 'medium',
      });
    }
    return Array.from(factMap.values()).slice(0, 20);
  }

  private buildSummary(
    facts: AIMemoryFact[],
    input: {
      intent: AIIntent;
      userMessage: string;
      activeDatabase?: string | null;
      activeSchema?: string | null;
      activeTable?: string | null;
    },
  ) {
    const parts = [
      input.activeDatabase ? `Database ${input.activeDatabase}` : null,
      input.activeSchema ? `schema ${input.activeSchema}` : null,
      input.activeTable ? `table ${input.activeTable}` : null,
      `recent intent ${input.intent}`,
    ].filter(Boolean);

    const preferenceParts = facts
      .filter((fact) => fact.key === 'preferred_provider' || fact.key === 'preferred_model')
      .map((fact) => `${fact.key.replace('preferred_', '')}: ${fact.value}`);

    return [
      parts.length ? `Current focus: ${parts.join(', ')}.` : '',
      preferenceParts.length ? `Preferences: ${preferenceParts.join(', ')}.` : '',
      `Last user message: ${input.userMessage.slice(0, 160)}.`,
    ]
      .filter(Boolean)
      .join(' ');
  }
}
