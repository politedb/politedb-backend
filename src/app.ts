import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { ZodError } from "zod";
import { HTTPClientError } from "@polar-sh/sdk/models/errors/httpclienterrors.js";
import { PolarError } from "@polar-sh/sdk/models/errors/polarerror.js";
import { env } from "./config/env";
import { AppError } from "./errors";
import { reportError } from "./instrument";
import indexRouter from "./routes";

export const app = express();

const UPSTREAM_UNAVAILABLE = {
  error: "UPSTREAM_ERROR",
  message: "License service unavailable. Please try again later.",
};

/**
 * Maps a Polar API status to our response. Client errors become 4xx (never 404: the
 * desktop app treats 404 as a missing endpoint). Polar outages and our own credential or
 * quota problems become 503; 502 is avoided because Cloudflare replaces 502 bodies.
 */
export function mapPolarError(statusCode: number): { status: number; body: { error: string; message: string } } {
  if (statusCode === 404) {
    return { status: 400, body: { error: "LICENSE_NOT_FOUND", message: "License key not found." } };
  }
  if (statusCode === 403) {
    return {
      status: 403,
      body: { error: "LICENSE_NOT_PERMITTED", message: "This license key cannot be used for this action." },
    };
  }
  // 401: our Polar token is invalid; 429: our Polar quota. Neither is the caller's fault.
  if (statusCode === 401 || statusCode === 429 || statusCode >= 500) {
    return { status: 503, body: UPSTREAM_UNAVAILABLE };
  }
  // 400/409/422 and other client errors: the license key or activation token is malformed.
  return { status: 400, body: { error: "INVALID_LICENSE_REQUEST", message: "The license request is invalid." } };
}

app.set("trust proxy", env.trustProxy);

morgan.token("real-ip", (req) => {
  const request = req as express.Request;
  return request.ip ?? request.socket.remoteAddress ?? "-";
});

morgan.token("request-id", (req) => {
  const request = req as express.Request;
  return request.get("x-request-id") ?? "-";
});

const httpLogFormat = [
  ":method",
  ":url",
  ":status",
  ":response-time ms",
  "ip=:real-ip",
  "rid=:request-id",
  'ua=":user-agent"',
].join(" ");

app.use(helmet());
// Only the landing page calls this API from a browser; the desktop app and Polar webhooks
// are not subject to CORS.
app.use(cors({ origin: env.checkoutAllowedOrigins }));
app.use("/api/v1/polar/webhooks", express.raw({ type: "*/*" }));
app.use(express.json());
app.use(morgan(httpLogFormat));

app.get("/", (_req, res) => {
  res.redirect("/api/health");
});

app.use("/api", indexRouter);

app.use(
  (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof ZodError) {
      res.status(400).json({
        error: "INVALID_PAYLOAD",
        details: error.issues,
      });
      return;
    }

    if (error instanceof AppError) {
      res.status(error.status).json({
        error: error.code,
        message: error.message,
      });
      return;
    }

    if (error instanceof PolarError) {
      const mapped = mapPolarError(error.statusCode);
      if (mapped.status >= 500) {
        console.error(`Polar API error: status=${error.statusCode}`);
        reportError(error);
      }
      res.status(mapped.status).json(mapped.body);
      return;
    }

    if (error instanceof HTTPClientError) {
      // Network failure or timeout talking to Polar.
      console.error(`Polar request failed: ${error.name}`);
      reportError(error);
      res.status(503).json(UPSTREAM_UNAVAILABLE);
      return;
    }

    // Full details stay in server logs; clients only get a generic error.
    console.error("Unhandled error", error);
    reportError(error);
    res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
    });
  },
);
