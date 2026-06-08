import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from '../src/config.js';

test('loadConfig exposes host with a safe local default', () => {
  const originalHost = process.env.HOST;
  delete process.env.HOST;

  try {
    const config = loadConfig();
    assert.equal(config.host, '127.0.0.1');
  } finally {
    if (originalHost === undefined) {
      delete process.env.HOST;
    } else {
      process.env.HOST = originalHost;
    }
  }
});

test('loadConfig allows deployment host override', () => {
  const originalHost = process.env.HOST;
  process.env.HOST = '0.0.0.0';

  try {
    const config = loadConfig();
    assert.equal(config.host, '0.0.0.0');
  } finally {
    if (originalHost === undefined) {
      delete process.env.HOST;
    } else {
      process.env.HOST = originalHost;
    }
  }
});

test('loadConfig keeps remote RAG context sharing disabled unless explicitly enabled', () => {
  const original = process.env.ALLOW_REMOTE_RAG_CONTEXT;
  delete process.env.ALLOW_REMOTE_RAG_CONTEXT;

  try {
    assert.equal(loadConfig().allowRemoteRagContext, false);
    process.env.ALLOW_REMOTE_RAG_CONTEXT = 'true';
    assert.equal(loadConfig().allowRemoteRagContext, true);
  } finally {
    if (original === undefined) {
      delete process.env.ALLOW_REMOTE_RAG_CONTEXT;
    } else {
      process.env.ALLOW_REMOTE_RAG_CONTEXT = original;
    }
  }
});

test('loadConfig exposes an optional deployable AIHub RAG index path', () => {
  const original = process.env.AIHUB_RAG_INDEX_PATH;
  process.env.AIHUB_RAG_INDEX_PATH = 'app_data/deployable-rag.json';

  try {
    assert.equal(loadConfig().aihubRagIndexPath, 'app_data/deployable-rag.json');
  } finally {
    if (original === undefined) {
      delete process.env.AIHUB_RAG_INDEX_PATH;
    } else {
      process.env.AIHUB_RAG_INDEX_PATH = original;
    }
  }
});

test('loadConfig exposes safe chat rate limit defaults and overrides', () => {
  const originalWindow = process.env.CHAT_RATE_LIMIT_WINDOW_MS;
  const originalMax = process.env.CHAT_RATE_LIMIT_MAX;
  delete process.env.CHAT_RATE_LIMIT_WINDOW_MS;
  delete process.env.CHAT_RATE_LIMIT_MAX;

  try {
    let config = loadConfig();
    assert.equal(config.chatRateLimitWindowMs, 600_000);
    assert.equal(config.chatRateLimitMax, 120);

    process.env.CHAT_RATE_LIMIT_WINDOW_MS = '300000';
    process.env.CHAT_RATE_LIMIT_MAX = '30';
    config = loadConfig();
    assert.equal(config.chatRateLimitWindowMs, 300_000);
    assert.equal(config.chatRateLimitMax, 30);

    process.env.CHAT_RATE_LIMIT_WINDOW_MS = 'invalid';
    process.env.CHAT_RATE_LIMIT_MAX = '0';
    config = loadConfig();
    assert.equal(config.chatRateLimitWindowMs, 600_000);
    assert.equal(config.chatRateLimitMax, 120);
  } finally {
    if (originalWindow === undefined) {
      delete process.env.CHAT_RATE_LIMIT_WINDOW_MS;
    } else {
      process.env.CHAT_RATE_LIMIT_WINDOW_MS = originalWindow;
    }
    if (originalMax === undefined) {
      delete process.env.CHAT_RATE_LIMIT_MAX;
    } else {
      process.env.CHAT_RATE_LIMIT_MAX = originalMax;
    }
  }
});
