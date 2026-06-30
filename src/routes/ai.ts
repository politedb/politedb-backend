import { Router } from 'express';
import type { Request, RequestHandler } from 'express';
import {
  aiConfirmToolProposalSchema,
  aiCreateSnippetSchema,
  aiCreateThreadSchema,
  aiIndexDocsPayloadSchema,
  aiIndexQueryHistoryPayloadSchema,
  aiIndexSchemaPayloadSchema,
  aiIndexScopeSchema,
  aiTurnRequestSchema,
} from '@/common/validations/ai.validation';
import {
  aiPlanFromHeader,
  clearAiIndex,
  confirmAiToolProposal,
  createAiRequestContext,
  createAiSnippet,
  createAiThread,
  disableAiIndex,
  enableAiIndex,
  getAiHttpErrorResponse,
  getAiIndexStatus,
  getAiSnippet,
  getAiThread,
  getAiUsage,
  indexAiDocs,
  indexAiQueryHistory,
  indexAiSchema,
  listAiModels,
  listAiSnippets,
  sendAiMessage,
  streamAiMessage,
} from '@/services/ai.service';

export const aiRouter = Router();

function sendAiError(res: import('express').Response, error: unknown) {
  const response = getAiHttpErrorResponse(error);
  res.status(response.status).json(response.body);
}

function wrapAiHandler(handler: (req: Request) => unknown | Promise<unknown>): RequestHandler {
  return (req, res) => {
    Promise.resolve(handler(req))
      .then((result) => res.json(result))
      .catch((error) => sendAiError(res, error));
  };
}

aiRouter.post(
  '/threads',
  wrapAiHandler(async (req) => createAiThread(aiCreateThreadSchema.parse(req.body))),
);

aiRouter.get(
  '/threads/:threadId',
  wrapAiHandler(async (req) => getAiThread(String(req.params.threadId))),
);

aiRouter.post(
  '/threads/:threadId/messages',
  wrapAiHandler(async (req) =>
    sendAiMessage(
      String(req.params.threadId),
      aiTurnRequestSchema.parse(req.body),
      createAiRequestContext(req.headers),
    ),
  ),
);

aiRouter.post('/threads/:threadId/stream', async (req, res) => {
  try {
    const payload = aiTurnRequestSchema.parse(req.body);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });

    for await (const chunk of streamAiMessage(
      String(req.params.threadId),
      payload,
      createAiRequestContext(req.headers),
    )) {
      const eventName = chunk.type === 'token' ? 'token' : chunk.type;
      const data =
        chunk.type === 'token'
          ? { text: chunk.text ?? '' }
          : chunk.type === 'error'
            ? { error: chunk.error ?? 'AI_STREAM_FAILED' }
            : (chunk.metadata ?? {});
      res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
    }

    res.end();
  } catch (error) {
    if (!res.headersSent) {
      sendAiError(res, error);
      return;
    }
    res.write(
      `event: error\ndata: ${JSON.stringify({
        error: error instanceof Error ? error.message : 'AI_STREAM_FAILED',
      })}\n\n`,
    );
    res.end();
  }
});

aiRouter.post(
  '/tool-proposals/:proposalId/confirm',
  wrapAiHandler(async (req) =>
    confirmAiToolProposal(
      String(req.params.proposalId),
      aiConfirmToolProposalSchema.parse(req.body ?? {}),
    ),
  ),
);

aiRouter.get(
  '/models',
  wrapAiHandler(async (req) => listAiModels(aiPlanFromHeader(req.headers['x-user-plan']))),
);

aiRouter.get(
  '/usage',
  wrapAiHandler(async (req) => getAiUsage(createAiRequestContext(req.headers))),
);

aiRouter.post(
  '/index/connections/:connectionId/enable',
  wrapAiHandler(async (req) =>
    enableAiIndex(String(req.params.connectionId), aiIndexScopeSchema.parse(req.body)),
  ),
);

aiRouter.post(
  '/index/connections/:connectionId/disable',
  wrapAiHandler(async (req) =>
    disableAiIndex(String(req.params.connectionId), aiIndexScopeSchema.parse(req.body)),
  ),
);

aiRouter.get(
  '/index/connections/:connectionId/status',
  wrapAiHandler(async (req) =>
    getAiIndexStatus(String(req.params.connectionId), aiIndexScopeSchema.parse(req.query)),
  ),
);

aiRouter.delete(
  '/index/connections/:connectionId',
  wrapAiHandler(async (req) =>
    clearAiIndex(String(req.params.connectionId), aiIndexScopeSchema.parse(req.query)),
  ),
);

aiRouter.post(
  '/index/schema',
  wrapAiHandler(async (req) => indexAiSchema(aiIndexSchemaPayloadSchema.parse(req.body))),
);

aiRouter.post(
  '/index/query-history',
  wrapAiHandler(async (req) =>
    indexAiQueryHistory(aiIndexQueryHistoryPayloadSchema.parse(req.body)),
  ),
);

aiRouter.post(
  '/index/docs',
  wrapAiHandler(async (req) => indexAiDocs(aiIndexDocsPayloadSchema.parse(req.body))),
);

aiRouter.get(
  '/snippets',
  wrapAiHandler(async (req) => {
    const workspaceId = String(req.query.workspaceId ?? '').trim();
    const connectionId = String(req.query.connectionId ?? '').trim();
    if (!workspaceId || !connectionId) {
      throw new Error('AI_SNIPPET_SCOPE_REQUIRED');
    }
    return listAiSnippets(workspaceId, connectionId);
  }),
);

aiRouter.post(
  '/snippets',
  wrapAiHandler(async (req) =>
    createAiSnippet(aiCreateSnippetSchema.parse(req.body), createAiRequestContext(req.headers)),
  ),
);

aiRouter.get(
  '/snippets/:snippetId',
  wrapAiHandler(async (req) => getAiSnippet(String(req.params.snippetId))),
);
