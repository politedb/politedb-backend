import * as Sentry from "@sentry/node";
import { env } from "./config/env";

/**
 * Error reporting. Disabled unless SENTRY_DSN is set. Events never carry request bodies,
 * cookies, query strings or auth headers: bodies contain license keys and customer emails.
 */
export function initErrorReporting() {
  if (!env.sentryDsn) {
    return;
  }

  Sentry.init({
    dsn: env.sentryDsn,
    environment: env.sentryEnvironment,
    // Collect nothing request-derived; beforeSend below is a second line of defense.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
    tracesSampleRate: 0,
    beforeSend(event) {
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        delete event.request.query_string;
        event.request.headers = {};
      }
      delete event.user;
      return event;
    },
  });
}

export function reportError(error: unknown) {
  if (env.sentryDsn) {
    Sentry.captureException(error);
  }
}

export async function flushErrorReporting(timeoutMs = 2000) {
  if (env.sentryDsn) {
    await Sentry.flush(timeoutMs);
  }
}
