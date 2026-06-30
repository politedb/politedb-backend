import type { Request, RequestHandler } from 'express';

type JsonRequestHandler = (req: Request) => unknown | Promise<unknown>;

type WrapHandlerOptions = {
  status?: number;
};

export function wrapHandler(
  handler: JsonRequestHandler,
  options?: WrapHandlerOptions,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req))
      .then((result) => {
        if (options?.status !== undefined) {
          res.status(options.status);
        }
        res.json(result);
      })
      .catch(next);
  };
}
