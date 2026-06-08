import assert from 'node:assert/strict';
import test from 'node:test';
import { buildHealthPayload } from '../src/health.js';

test('buildHealthPayload returns deployment-safe health without data internals', () => {
  const payload = buildHealthPayload({
    config: {
      openaiApiKey: 'test-openai-key',
      aihubRagIndexPath: '/opt/psych-ai/app_data/aihub-rag-index.deploy.json',
    },
    aihubRagIndex: {
      available: true,
      privacyMode: 'deployable_summary_only',
      recordCount: 1501,
      records: [{ safeSummary: '비공개' }],
      root: '/Users/local/raw-data',
    },
    checkedAt: '2026-06-07T00:00:00.000Z',
  });

  assert.deepEqual(payload, {
    ok: true,
    service: 'psychological-counseling-ai',
    checkedAt: '2026-06-07T00:00:00.000Z',
    openaiConfigured: true,
    ragIndexConfigured: true,
    ragIndexAvailable: true,
    ragPrivacyMode: 'deployable_summary_only',
  });
  assert.doesNotMatch(JSON.stringify(payload), /records|safeSummary|raw-data|Users/);
});
