import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { ZodError } from "zod";
import { PolarError } from "@polar-sh/sdk/models/errors/polarerror.js";
import { AppError } from "./errors";
import indexRouter from "./routes";

export const app = express();

app.set("trust proxy", true);

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
  'ua=":user-agent"',
].join(" ");

app.use(helmet());
app.use(cors());
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
      // Polar 404 means an unknown key/activation. Report it as 400: the desktop app
      // treats 404 responses as a missing endpoint.
      if (error.statusCode === 404) {
        res.status(400).json({ error: "LICENSE_NOT_FOUND", message: "License key not found." });
        return;
      }
      if (error.statusCode === 403) {
        res.status(403).json({
          error: "LICENSE_NOT_PERMITTED",
          message: "This license key cannot be used for this action.",
        });
        return;
      }
      console.error(`Polar API error: status=${error.statusCode}`);
      res.status(502).json({ error: "UPSTREAM_ERROR", message: "License service unavailable." });
      return;
    }

    // Full details stay in server logs; clients only get a generic error.
    console.error("Unhandled error", error);
    res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
    });
  },
);
