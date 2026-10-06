import assert from 'node:assert/strict';
import test from 'node:test';

import { enforceAccess } from '../src/features/sra-explorer/server/access.ts';

test('anonymous clients are limited per IP and tokens bypass the limit', async () => {
  delete process.env.KV_REST_API_URL;
  delete process.env.UPSTASH_REDIS_REST_URL;
  process.env.SRA_API_TOKENS = 'secret-token';
  const request = (headers: Record<string, string>) => new Request('https://example.org/api', { headers });
  for (let index = 0; index < 30; index += 1) await enforceAccess(request({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }));
  await assert.rejects(enforceAccess(request({ 'x-forwarded-for': '203.0.113.9' })), (error: Response) => error.status === 429 && Number(error.headers.get('retry-after')) > 0);
  assert.equal((await enforceAccess(request({ 'x-forwarded-for': '198.51.100.1' }))).remaining, 29);
  assert.equal((await enforceAccess(request({ 'x-forwarded-for': '203.0.113.9', authorization: 'Bearer secret-token' }))).authenticated, true);
});
