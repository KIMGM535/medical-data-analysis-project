import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildKnowledgeContext,
  loadAihubInventory,
  loadTrainingVideoNotes,
  summarizeInventory,
  summarizeTrainingVideoNotes,
} from '../src/knowledge.js';

test('loadAihubInventory reads a saved AIHub inventory file', () => {
  const inventory = loadAihubInventory(makeInventoryFixture());

  assert.equal(inventory.datasetSn, '71806');
  assert.equal(inventory.files.length, 4);
  assert.equal(inventory.totalFileSizeBytes, 4096);
});

test('loadAihubInventory falls back when public deploy excludes local AIHub files', () => {
  const inventory = loadAihubInventory('/tmp/missing-aihub-inventory.json');

  assert.equal(inventory.datasetSn, '71806');
  assert.equal(inventory.files.length, 0);
  assert.equal(inventory.available, false);
});

test('summarizeInventory reports train/validation and source/label splits', () => {
  const summary = summarizeInventory(loadAihubInventory(makeInventoryFixture()));

  assert.deepEqual(summary.splitCounts, {
    'Training/01.원천데이터': 1,
    'Training/02.라벨링데이터': 1,
    'Validation/01.원천데이터': 1,
    'Validation/02.라벨링데이터': 1,
  });
  assert.deepEqual(summary.conditionCounts, {
    우울증: 1,
    불안장애: 1,
    중독: 1,
    일반군: 1,
  });
});

test('buildKnowledgeContext includes access limitation and dataset source', () => {
  const context = buildKnowledgeContext(loadAihubInventory(makeInventoryFixture()));

  assert.match(context, /심리상담 데이터/);
  assert.match(context, /4/);
  assert.match(context, /로그인 및 다운로드 승인/);
});

test('loadTrainingVideoNotes exposes counseling dataset and AI model usage facts', () => {
  const notes = loadTrainingVideoNotes(makeTrainingVideoNotesFixture());
  const summary = summarizeTrainingVideoNotes(notes);

  assert.equal(notes.url, 'https://www.youtube.com/watch?v=yZZPyNnqL4Y');
  assert.equal(summary.datasetHours, 1661);
  assert.equal(summary.labelScale, '0-3');
  assert.deepEqual(summary.models, ['KLUE-BERT 질환 예측', 'KoAlpaca 상담 보고서 생성']);
});

test('loadTrainingVideoNotes falls back when local notes are not deployed', () => {
  const notes = loadTrainingVideoNotes('/tmp/missing-aihub-training-video-notes.json');
  const summary = summarizeTrainingVideoNotes(notes);

  assert.equal(notes.url, 'https://www.youtube.com/watch?v=yZZPyNnqL4Y');
  assert.equal(summary.datasetHours, 1661);
  assert.deepEqual(summary.models, ['KLUE-BERT 질환 예측', 'KoAlpaca 상담 보고서 생성']);
});

test('buildKnowledgeContext includes training video model guidance', () => {
  const context = buildKnowledgeContext(
    loadAihubInventory(makeInventoryFixture()),
    loadTrainingVideoNotes(makeTrainingVideoNotesFixture()),
  );

  assert.match(context, /1661시간/);
  assert.match(context, /46만/);
  assert.match(context, /KLUE-BERT/);
  assert.match(context, /KoAlpaca/);
});

test('buildKnowledgeContext includes loaded raw dataset evidence when available', () => {
  const context = buildKnowledgeContext(loadAihubInventory(makeInventoryFixture()), loadTrainingVideoNotes(makeTrainingVideoNotesFixture()), {
    available: true,
    sourceTextCount: 1501,
    labelJsonCount: 1501,
    matchedPairCount: 1501,
    classCounts: {
      DEPRESSION: 400,
      ANXIETY: 380,
    },
  });

  assert.match(context, /원천 텍스트 1501개/);
  assert.match(context, /라벨 JSON 1501개/);
  assert.match(context, /DEPRESSION: 400/);
});

test('buildKnowledgeContext includes counselor style learning evidence when available', () => {
  const context = buildKnowledgeContext(
    loadAihubInventory(makeInventoryFixture()),
    loadTrainingVideoNotes(makeTrainingVideoNotesFixture()),
    null,
    {
      available: true,
      counselorTurnCount: 100,
      clientTurnCount: 80,
      questionTurnRatio: 0.42,
      rogerianSummary: '공감적 이해와 명료화/반영이 실제 상담사 개입의 핵심 축으로 확인됩니다.',
      primaryCounselorMoves: [
        { label: 'clarification_reflection', korean: '명료화/반영', count: 30 },
        { label: 'sympathy_support', korean: '공감/지지', count: 20 },
      ],
    },
  );

  assert.match(context, /실제 상담사 대화 학습/);
  assert.match(context, /상담사 발화 100개/);
  assert.match(context, /명료화\/반영/);
  assert.match(context, /공감적 이해/);
});

function makeInventoryFixture() {
  const filePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aihub-inventory-fixture-')), 'inventory.json');
  fs.writeFileSync(
    filePath,
    JSON.stringify({
      datasetSn: '71806',
      fileCount: 4,
      totalFileSizeBytes: 4096,
      roots: ['16.심리상담 데이터'],
      files: [
        {
          fileStreCours: '16.심리상담_데이터/3.개방데이터/1.데이터/Training/01.원천데이터',
          streFileNm: 'TS_001. 우울증_0001.zip',
        },
        {
          fileStreCours: '16.심리상담_데이터/3.개방데이터/1.데이터/Training/02.라벨링데이터',
          streFileNm: 'TL_002. 불안장애_0001.zip',
        },
        {
          fileStreCours: '16.심리상담_데이터/3.개방데이터/1.데이터/Validation/01.원천데이터',
          streFileNm: 'VS_003. 중독_0001.zip',
        },
        {
          fileStreCours: '16.심리상담_데이터/3.개방데이터/1.데이터/Validation/02.라벨링데이터',
          streFileNm: 'VL_004. 일반군_0001.zip',
        },
      ],
    }),
  );
  return filePath;
}

function makeTrainingVideoNotesFixture() {
  const filePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aihub-video-fixture-')), 'notes.json');
  fs.writeFileSync(
    filePath,
    JSON.stringify({
      url: 'https://www.youtube.com/watch?v=yZZPyNnqL4Y',
      datasetFacts: {
        hours: 1661,
        processedCounselingCases: 1661,
        tokenCountText: '40만 토큰 이상',
        sentenceTokenCountText: '46만 건 이상',
        labelScale: '0-3',
        labels: ['주요 증상', '위험 요인', '개선 요인', '개입 요인'],
      },
      models: [
        { name: 'KLUE-BERT 질환 예측' },
        { name: 'KoAlpaca 상담 보고서 생성' },
      ],
      applicationIdeas: ['정신건강 조기진단 서비스', '디지털 심리상담 플랫폼', '교육 및 연구 지원'],
    }),
  );
  return filePath;
}
