import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { errorHandler, notFound } from '../src/middleware/errors.js';

function makeApp() {
  const app = express();
  app.use(express.json({ limit: '16kb' }));
  app.post('/t', (_req, res) => res.status(200).json({ ok: true }));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

test('invalid JSON payload returns 400 (not 500)', async () => {
  const app = makeApp();

  const res = await request(app)
    .post('/t')
    .set('Content-Type', 'application/json')
    .send('{ "role": "consumer"');

  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Invalid JSON');
});

test('oversized JSON payload returns 413 (not 500)', async () => {
  const app = makeApp();
  const huge = JSON.stringify({ name: 'a'.repeat(20000) });

  const res = await request(app)
    .post('/t')
    .set('Content-Type', 'application/json')
    .send(huge);

  assert.equal(res.status, 413);
  assert.equal(res.body.error, 'Payload Too Large');
});

