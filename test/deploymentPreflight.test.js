import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { readEnvFile, runDeploymentPreflight } from '../src/deploymentPreflight.js';

test('runDeploymentPreflight fails closed without API key and deployable RAG path', () => {
  const result = runDeploymentPreflight({
    env: {
      HOST: '0.0.0.0',
      PORT: '5173',
      ALLOW_REMOTE_RAG_CONTEXT: 'false',
    },
  });

  assert.equal(result.ok, false);
  assert.ok(result.failures.some((item) => item.code === 'openai_api_key_missing'));
  assert.ok(result.failures.some((item) => item.code === 'aihub_rag_index_path_missing'));
});

test('runDeploymentPreflight accepts a valid deployable RAG index path', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deployment-preflight-valid-'));
  const indexPath = path.join(root, 'aihub-rag-index.deploy.json');
  fs.writeFileSync(
    indexPath,
    JSON.stringify({
      kind: 'aihub_71806_deployable_rag_index',
      version: 1,
      privacyMode: 'deployable_summary_only',
      createdAt: '2026-06-07T00:00:00.000Z',
      recordCount: 1,
      classCounts: { ANXIETY: 1 },
      records: [
        {
          condition: 'ANXIETY',
          diagnosisScores: { depression: 0, anxiety: 2, addiction: 0 },
          diagnosisStrength: 2,
          topClientLabels: [{ label: 'sleep_disturbance', score: 2 }],
          topCounselorInterventions: [{ label: 'clarification_reflection', score: 2 }],
          sourceSignals: { sleep_disturbance: 1 },
          safeSummary: '불안과 수면 어려움에 대한 비식별 요약.',
          searchText: 'ANXIETY anxiety sleep_disturbance clarification_reflection',
        },
      ],
    }),
  );

  const result = runDeploymentPreflight({
    env: {
      NODE_ENV: 'production',
      HOST: '0.0.0.0',
      PORT: '5173',
      OPENAI_API_KEY: 'test-openai-key',
      AIHUB_RAG_INDEX_PATH: indexPath,
      ALLOW_REMOTE_RAG_CONTEXT: 'false',
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
  assert.ok(result.checks.some((item) => item.code === 'deployable_rag_index_valid' && item.status === 'pass'));
});

test('runDeploymentPreflight rejects raw AIHub paths and leaking deployable indexes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deployment-preflight-invalid-'));
  const rawLikeDir = path.join(root, 'aihub_71806', 'api_download');
  fs.mkdirSync(rawLikeDir, { recursive: true });
  const indexPath = path.join(rawLikeDir, 'bad-rag.json');
  fs.writeFileSync(
    indexPath,
    JSON.stringify({
      kind: 'aihub_71806_deployable_rag_index',
      privacyMode: 'deployable_summary_only',
      records: [
        {
          condition: 'ANXIETY',
          caseKey: 'anxiety_1_check_A001',
          diagnosisScores: { depression: 0, anxiety: 2, addiction: 0 },
          diagnosisStrength: 2,
          topClientLabels: [],
          topCounselorInterventions: [],
          sourceSignals: {},
          safeSummary: '내담자 : 잠을 못 자요.',
          searchText: 'resource_anxiety_1_check_A001.txt',
        },
      ],
    }),
  );

  const result = runDeploymentPreflight({
    env: {
      NODE_ENV: 'production',
      HOST: '0.0.0.0',
      OPENAI_API_KEY: 'test-openai-key',
      AIHUB_RAG_INDEX_PATH: indexPath,
      ALLOW_REMOTE_RAG_CONTEXT: 'false',
    },
  });

  assert.equal(result.ok, false);
  assert.ok(result.failures.some((item) => item.code === 'aihub_rag_index_path_points_to_raw_area'));
  assert.ok(result.failures.some((item) => item.code === 'deployable_rag_index_invalid'));
});

test('runDeploymentPreflight warns when production binding is still local-only', () => {
  const result = runDeploymentPreflight({
    env: {
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      OPENAI_API_KEY: 'test-openai-key',
      AIHUB_RAG_INDEX_PATH: '/opt/psych-ai/app_data/aihub-rag-index.deploy.json',
      ALLOW_REMOTE_RAG_CONTEXT: 'false',
    },
  });

  assert.ok(result.warnings.some((item) => item.code === 'host_not_public_bind'));
});

test('readEnvFile parses deployment env files without exposing comments', () => {
  const envPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'deployment-env-file-')), '.env');
  fs.writeFileSync(
    envPath,
    [
      '# production secrets',
      'OPENAI_MODEL=gpt-4.1-mini',
      'AIHUB_RAG_INDEX_PATH="/opt/psych-ai/app_data/aihub-rag-index.deploy.json"',
      'ALLOW_REMOTE_RAG_CONTEXT=false',
      '',
    ].join('\n'),
  );

  assert.deepEqual(readEnvFile(envPath), {
    OPENAI_MODEL: 'gpt-4.1-mini',
    AIHUB_RAG_INDEX_PATH: '/opt/psych-ai/app_data/aihub-rag-index.deploy.json',
    ALLOW_REMOTE_RAG_CONTEXT: 'false',
  });
});
