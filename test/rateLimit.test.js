import assert from 'node:assert/strict';
import test from 'node:test';
import { createRateLimiter, parsePositiveInteger } from '../src/rateLimit.js';

test('parsePositiveInteger keeps safe defaults for invalid values', () => {
  assert.equal(parsePositiveInteger(undefined, 120), 120);
  assert.equal(parsePositiveInteger('0', 120), 120);
  assert.equal(parsePositiveInteger('-1', 120), 120);
  assert.equal(parsePositiveInteger('abc', 120), 120);
  assert.equal(parsePositiveInteger('30', 120), 30);
});

test('createRateLimiter allows requests until the window limit is reached', () => {
  let now = 1_000;
  const limiter = createRateLimiter({ windowMs: 1_000, maxRequests: 2, now: () => now });

  assert.equal(limiter.check('client-a').allowed, true);
  assert.equal(limiter.check('client-a').allowed, true);

  const denied = limiter.check('client-a');
  assert.equal(denied.allowed, false);
  assert.equal(denied.retryAfterSeconds, 1);

  now = 2_001;
  assert.equal(limiter.check('client-a').allowed, true);
});

test('createRateLimiter keeps separate counters per client key', () => {
  const limiter = createRateLimiter({ windowMs: 1_000, maxRequests: 1, now: () => 1_000 });

  assert.equal(limiter.check('client-a').allowed, true);
  assert.equal(limiter.check('client-a').allowed, false);
  assert.equal(limiter.check('client-b').allowed, true);
});
