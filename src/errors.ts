/**
 * Expected business errors. `code` is returned as `error` and `message` is shown to users
 * (the desktop app prefers `message` over `error`).
 *
 * Never use 404 for business errors: the desktop app treats 404 as "endpoint not found"
 * and silently tries the next candidate URL.
 */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "AppError";
  }
}

export const badRequest = (code: string, message?: string) => new AppError(400, code, message);
export const forbidden = (code: string, message?: string) => new AppError(403, code, message);
