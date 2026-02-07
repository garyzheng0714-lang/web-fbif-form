import pino from 'pino';
import { env } from '../config/env.js';

export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers.x-csrf-token',
      'req.headers.idempotency-key',
      'req.body.phone',
      'req.body.idNumber',
      'req.body.proofFiles',
      'req.body.proofFileNames',
      'res.body.statusToken'
    ],
    remove: true
  }
});
