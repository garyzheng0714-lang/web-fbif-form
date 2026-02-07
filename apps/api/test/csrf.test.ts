import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { csrfRouter } from '../src/routes/csrf.js';
import { csrfGuard } from '../src/middleware/csrf.js';

function makeApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use('/api/csrf', csrfRouter);
  app.post('/api/secure', csrfGuard, (_req, res) => {
    res.status(200).json({ ok: true });
  });
  return app;
}

test('csrf token can be issued and reused', async () => {
  const app = makeApp();
  const agent = request.agent(app);
  const csrfRes = await agent.get('/api/csrf');

  assert.equal(csrfRes.status, 200);
  assert.equal(typeof csrfRes.body.csrfToken, 'string');

  const secureRes = await agent
    .post('/api/secure')
    .set('X-CSRF-Token', csrfRes.body.csrfToken)
    .send({});

  assert.equal(secureRes.status, 200);
});

test('csrf guard rejects missing or mismatched token', async () => {
  const app = makeApp();
  const agent = request.agent(app);
  const csrfRes = await agent.get('/api/csrf');
  assert.equal(csrfRes.status, 200);

  const missingHeader = await agent.post('/api/secure').send({});
  assert.equal(missingHeader.status, 403);

  const badHeader = await agent
    .post('/api/secure')
    .set('X-CSRF-Token', 'bad-token')
    .send({});
  assert.equal(badHeader.status, 403);
});
