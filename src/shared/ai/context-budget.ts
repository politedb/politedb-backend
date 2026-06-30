import type { AICitation } from '@/types';

export class ContextBudgetService {
  mergeCitations(input: { rag: AICitation[]; docs: AICitation[]; maxItems?: number }) {
    const seen = new Set<string>();
    const merged: AICitation[] = [];
    for (const item of [...input.rag, ...input.docs].sort((a, b) => b.score - a.score)) {
      const key = `${item.sourceId}:${item.snippet}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
      if (merged.length >= (input.maxItems ?? 8)) break;
    }
    return merged;
  }
}
