import crypto from 'node:crypto';
import type { RequestHandler } from 'express';
import { env, isProd } from '../config/env.js';

function randomToken() {
  return crypto.randomBytes(24).toString('base64url');
}

function readCsrfTokenFromHeader(header: string | string[] | undefined): string {
  if (!header) return '';
  return Array.isArray(header) ? String(header[0] || '') : String(header);
}

export const issueCsrfToken: RequestHandler = (_req, res) => {
  const token = randomToken();
  res.cookie(env.CSRF_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: isProd,
    path: '/'
  });
  res.json({ csrfToken: token });
};

export const csrfGuard: RequestHandler = (req, res, next) => {
  const headerToken = readCsrfTokenFromHeader(req.headers['x-csrf-token']);
  const cookieToken = String(req.cookies?.[env.CSRF_COOKIE_NAME] || '');

  if (!headerToken || !cookieToken || headerToken !== cookieToken) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }

  return next();
};
