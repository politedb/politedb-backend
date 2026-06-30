import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { ZodError } from 'zod';
import indexRouter from './routes';

export const app = express();

app.set('trust proxy', true);

morgan.token('real-ip', (req) => {
  const request = req as express.Request;
  return request.ip ?? request.socket.remoteAddress ?? '-';
});

morgan.token('request-id', (req) => {
  const request = req as express.Request;
  return request.get('x-request-id') ?? '-';
});

const httpLogFormat = [
  ':method',
  ':url',
  ':status',
  ':response-time ms',
  'ip=:real-ip',
  'ua=":user-agent"',
].join(' ');

app.use(helmet());
app.use(cors());
app.use('/api/v1/polar/webhooks', express.raw({ type: '*/*' }));
app.use(express.json());
app.use(morgan(httpLogFormat));

app.get('/', (_req, res) => {
  res.redirect('/api/health');
});

app.use('/api', indexRouter);

app.use(
  (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof ZodError) {
      res.status(400).json({
        error: 'INVALID_PAYLOAD',
        details: error.issues,
      });
      return;
    }

    if (error instanceof Error) {
      const statusCode = error.message === 'UNAUTHORIZED' ? 401 : 400;
      res.status(statusCode).json({
        error: error.message,
      });
      return;
    }

    res.status(500).json({
      error: 'INTERNAL_SERVER_ERROR',
    });
  },
);
