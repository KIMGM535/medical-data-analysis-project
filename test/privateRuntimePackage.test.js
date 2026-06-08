import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createPrivateRuntimePackage } from '../src/privateRuntimePackage.js';

test('createPrivateRuntimePackage copies only validated private runtime files', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'private-runtime-package-'));
  const indexPath = path.join(temp, 'aihub-rag-index.deploy.json');
  const outputDir = path.join(temp, 'private_runtime_package');
  fs.writeFileSync(indexPath, JSON.stringify(makeDeployableIndex(), null, 2));

  const result = createPrivateRuntimePackage({ indexPath, outputDir });

  assert.equal(result.ok, true);
  assert.equal(result.recordCount, 1);
  assert.deepEqual(result.files.sort(), [
    '.env.template',
    'README-USB.md',
    'app_data/aihub-rag-index.deploy.json',
    'checks/verification-commands.txt',
    'docs/github-code-linking.md',
    'docs/presentation-pc-setup.md',
  ].sort());

  const copiedIndex = fs.readFileSync(path.join(outputDir, 'app_data', 'aihub-rag-index.deploy.json'), 'utf8');
  const envTemplate = fs.readFileSync(path.join(outputDir, '.env.template'), 'utf8');
  const readme = fs.readFileSync(path.join(outputDir, 'README-USB.md'), 'utf8');
  const guide = fs.readFileSync(path.join(outputDir, 'docs', 'presentation-pc-setup.md'), 'utf8');
  const linkingGuide = fs.readFileSync(path.join(outputDir, 'docs', 'github-code-linking.md'), 'utf8');

  assert.match(envTemplate, /AIHUB_RAG_INDEX_PATH=app_data\/aihub-rag-index\.deploy\.json/);
  assert.match(envTemplate, /HOST=127\.0\.0\.1/);
  assert.doesNotMatch(envTemplate, /sk-[A-Za-z0-9]/);
  assert.match(readme + guide, /USB는 실행 매체가 아니라 파일 전달 매체/);
  assert.match(linkingGuide, /GitHub 코드와 USB 비공개 파일 연결 방법/);
  assert.match(linkingGuide, /git clone https:\/\/github\.com\/KIMGM535\/medical-data-analysis-project\.git/);
  assert.match(linkingGuide, /app_data\/aihub-rag-index\.deploy\.json/);
  assert.doesNotMatch(copiedIndex + envTemplate, /내담자\s*:|상담사\s*:|resource_|label_|api_download|01\.원천데이터|02\.라벨링데이터|\.txt"/);
});

test('createPrivateRuntimePackage fails when deployable RAG index is missing', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'private-runtime-missing-'));
  const result = createPrivateRuntimePackage({
    indexPath: path.join(temp, 'missing.json'),
    outputDir: path.join(temp, 'private_runtime_package'),
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, 'rag_index_missing');
});

test('createPrivateRuntimePackage fails closed when RAG index leaks raw identifiers', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'private-runtime-invalid-'));
  const indexPath = path.join(temp, 'invalid.json');
  fs.writeFileSync(
    indexPath,
    JSON.stringify({
      ...makeDeployableIndex(),
      records: [
        {
          ...makeDeployableIndex().records[0],
          safeSummary: 'resource_anxiety_1_check_A001.txt 원문을 참고함',
        },
      ],
    }),
  );

  const result = createPrivateRuntimePackage({
    indexPath,
    outputDir: path.join(temp, 'private_runtime_package'),
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, 'rag_index_validation_failed');
  assert.ok(result.reasons.includes('raw_filename_or_path_leak'));
});

function makeDeployableIndex() {
  return {
    kind: 'aihub_71806_deployable_rag_index',
    version: 1,
    privacyMode: 'deployable_summary_only',
    createdAt: '2026-06-08T00:00:00.000Z',
    recordCount: 1,
    classCounts: { ANXIETY: 1 },
    records: [
      {
        condition: 'ANXIETY',
        diagnosisScores: { depression: 0, anxiety: 2, addiction: 0 },
        diagnosisStrength: 2,
        topClientLabels: [{ label: 'sleep_disturbance', score: 2 }],
        topCounselorInterventions: [{ label: 'clarification_reflection', score: 2 }],
        sourceSignals: { counselorUtteranceCount: 1, clientUtteranceCount: 1 },
        safeSummary: '불안과 수면 어려움을 호소하며, 상담사는 감정 반영과 명료화 질문을 사용했다.',
        searchText: '불안 수면 어려움 감정 반영 명료화 질문',
      },
    ],
  };
}
