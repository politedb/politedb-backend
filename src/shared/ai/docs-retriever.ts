import type { AIDocumentFragment, AICitation } from '@/types';

export interface AIDocsRetriever {
  retrieve(message: string, docs: AIDocumentFragment[]): AICitation[];
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

export function retrieveDocs(message: string, docs: AIDocumentFragment[]) {
  if (!docs.length) {
    return [];
  }

  const queryTokens = new Set(tokenize(message));
  return docs
    .map((doc) => {
      const contentTokens = tokenize(`${doc.title ?? ''} ${doc.path ?? ''} ${doc.content}`);
      const uniqueTokens = new Set(contentTokens);
      let matches = 0;
      for (const token of queryTokens) {
        if (uniqueTokens.has(token)) {
          matches += 1;
        }
      }

      const score = queryTokens.size ? matches / queryTokens.size : 0;
      return {
        sourceId: doc.sourceId,
        title: doc.title ?? null,
        path: doc.path ?? null,
        snippet: doc.content.slice(0, 400),
        score,
      } satisfies AICitation;
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 4);
}
