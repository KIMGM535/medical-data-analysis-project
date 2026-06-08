import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildAihubRagContext, loadDeployableAihubRagIndex } from '../src/aihubRag.js';
import { exportDeployableAihubRagIndex } from '../src/aihubRagExport.js';

test('exportDeployableAihubRagIndex writes a validated deployable index without raw transcript leakage', () => {
  const root = makeRagFixture();
  const outputPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aihub-rag-export-write-')), 'rag.json');

  const result = exportDeployableAihubRagIndex({
    rawDatasetPath: root,
    outputPath,
    createdAt: '2026-06-03T00:00:00.000Z',
  });

  assert.equal(result.ok, true);
  assert.equal(result.outputPath, outputPath);
  assert.equal(result.recordCount, 1);
  assert.equal(result.validation.issueCount, 0);
  assert.equal(fs.existsSync(outputPath), true);

  const rawExport = fs.readFileSync(outputPath, 'utf8');
  assert.doesNotMatch(rawExport, /내담자\s*:|상담사\s*:|회사에서 심장이 뛰어요|resource_|label_|\.txt|\.json|caseKey|root/);

  const loaded = loadDeployableAihubRagIndex(outputPath);
  const context = buildAihubRagContext(loaded, {
    messages: [{ role: 'user', content: '불안하고 잠을 못 자요.' }],
  });

  assert.equal(loaded.available, true);
  assert.equal(context.available, true);
  assert.equal(context.matches[0].condition, 'ANXIETY');
});

test('exportDeployableAihubRagIndex fails closed when raw data is unavailable', () => {
  const outputPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aihub-rag-export-missing-')), 'rag.json');

  const result = exportDeployableAihubRagIndex({
    rawDatasetPath: path.join(os.tmpdir(), 'missing-aihub-rag-source'),
    outputPath,
    createdAt: '2026-06-03T00:00:00.000Z',
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, 'raw_rag_index_unavailable');
  assert.equal(fs.existsSync(outputPath), false);
});

function makeRagFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aihub-rag-export-fixture-'));
  const sourceDir = path.join(root, 'Training', '01.원천데이터', 'TS_002._불안장애_0001._1회기');
  const labelDir = path.join(root, 'Training', '02.라벨링데이터', 'TL_002._불안장애_0001._1회기');
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.mkdirSync(labelDir, { recursive: true });
  fs.writeFileSync(
    path.join(sourceDir, 'resource_anxiety_1_check_A001.txt'),
    [
      '상담사 : 안녕하세요.',
      '내담자 : 요즘 잠을 못 자고 불안해요. 회사에서 심장이 뛰어요.',
      '상담사 : 불안했던 순간을 조금 더 말해볼까요?',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(labelDir, 'label_anxiety_1_check_A001.json'),
    JSON.stringify({
      filename: 'label_anxiety_1_check_A001',
      id: 'A001',
      class: 'ANXIETY',
      depression: 0,
      anxiety: 2,
      addiction: 0,
      summary: '불안과 수면 어려움을 호소하며, 상담사는 감정 반영과 명료화 질문을 사용했다.',
      paragraph: [
        {
          paragraph_speaker: '내담자',
          paragraph_text: '요즘 잠을 못 자고 불안해요. 회사에서 심장이 뛰어요.',
          sleep_disturbance: 2,
          anxiety: 2,
          stressful_event: 1,
        },
        {
          paragraph_speaker: '상담사',
          paragraph_text: '불안했던 순간을 조금 더 말해볼까요?',
          sympathy_support: 1,
          clarification_reflection: 2,
        },
      ],
    }),
  );
  return root;
}
