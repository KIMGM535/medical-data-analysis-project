import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadAihubRawDatasetSummary } from '../src/aihubRawDataset.js';

test('loadAihubRawDatasetSummary summarizes unpacked AIHub source and label files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aihub-raw-'));
  const sourceDir = path.join(
    root,
    '16.심리상담_데이터',
    '3.개방데이터',
    '1.데이터',
    'Training',
    '01.원천데이터',
    'TS_001._우울증_0001._1회기',
  );
  const labelDir = path.join(
    root,
    '16.심리상담_데이터',
    '3.개방데이터',
    '1.데이터',
    'Training',
    '02.라벨링데이터',
    'TL_001._우울증_0001._1회기',
  );
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.mkdirSync(labelDir, { recursive: true });
  fs.writeFileSync(path.join(sourceDir, 'resource_depression_1_check_D002.txt'), '상담사 : 안녕하세요\n내담자 : 잠을 못 자요\n');
  fs.writeFileSync(
    path.join(labelDir, 'label_depression_1_check_D002.json'),
    JSON.stringify({
      filename: 'label_depression_1_check_D002',
      id: 'D002',
      depression: 2,
      anxiety: 0,
      addiction: 0,
      class: 'DEPRESSION',
      paragraph: [
        {
          paragraph_speaker: '내담자',
          paragraph_text: '잠을 못 자요',
          sleep_disturbance: 2,
          stressful_event: 1,
          sympathy_support: 0,
        },
      ],
    }),
  );

  const summary = loadAihubRawDatasetSummary(root);

  assert.equal(summary.available, true);
  assert.equal(summary.sourceTextCount, 1);
  assert.equal(summary.labelJsonCount, 1);
  assert.equal(summary.matchedPairCount, 1);
  assert.equal(summary.unmatchedSourceTextCount, 0);
  assert.equal(summary.unmatchedLabelJsonCount, 0);
  assert.deepEqual(summary.integrity, { ok: true, issueCount: 0, issues: [] });
  assert.equal(summary.splitCounts['Training/01.원천데이터'], 1);
  assert.equal(summary.splitCounts['Training/02.라벨링데이터'], 1);
  assert.deepEqual(summary.classCounts, { DEPRESSION: 1 });
  assert.equal(summary.diagnosisScoreDistributions.depression['2'], 1);
  assert.equal(summary.paragraphSignalCounts.sleep_disturbance, 1);
  assert.equal(summary.paragraphSignalCounts.stressful_event, 1);
});

test('loadAihubRawDatasetSummary reports unmatched source and label files as integrity issues', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aihub-raw-unmatched-'));
  const sourceDir = path.join(root, 'Training', '01.원천데이터', 'TS_001._우울증_0001._1회기');
  const labelDir = path.join(root, 'Training', '02.라벨링데이터', 'TL_001._우울증_0001._1회기');
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.mkdirSync(labelDir, { recursive: true });
  fs.writeFileSync(path.join(sourceDir, 'resource_depression_1_check_D001.txt'), '내담자 : 잠을 못 자요\n');
  fs.writeFileSync(path.join(sourceDir, 'resource_depression_1_check_D999.txt'), '내담자 : 매칭 라벨이 없어요\n');
  fs.writeFileSync(
    path.join(labelDir, 'label_depression_1_check_D001.json'),
    JSON.stringify({ class: 'DEPRESSION', depression: 2, anxiety: 0, addiction: 0, paragraph: [] }),
  );
  fs.writeFileSync(
    path.join(labelDir, 'label_depression_1_check_D998.json'),
    JSON.stringify({ class: 'DEPRESSION', depression: 1, anxiety: 0, addiction: 0, paragraph: [] }),
  );

  const summary = loadAihubRawDatasetSummary(root);

  assert.equal(summary.sourceTextCount, 2);
  assert.equal(summary.labelJsonCount, 2);
  assert.equal(summary.matchedPairCount, 1);
  assert.equal(summary.unmatchedSourceTextCount, 1);
  assert.equal(summary.unmatchedLabelJsonCount, 1);
  assert.equal(summary.integrity.ok, false);
  assert.equal(summary.integrity.issueCount, 2);
  assert.ok(summary.integrity.issues.some((issue) => issue.reason === 'source_without_label'));
  assert.ok(summary.integrity.issues.some((issue) => issue.reason === 'label_without_source'));
});

test('loadAihubRawDatasetSummary returns an unavailable summary when raw data is absent', () => {
  const summary = loadAihubRawDatasetSummary(path.join(os.tmpdir(), 'missing-aihub-raw-data'));

  assert.equal(summary.available, false);
  assert.equal(summary.sourceTextCount, 0);
  assert.equal(summary.labelJsonCount, 0);
});

test('loadAihubRawDatasetSummary recovers top-level labels from non-standard JSON files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aihub-raw-invalid-'));
  const sourceDir = path.join(root, 'Validation', '01.원천데이터', 'VS_002._불안장애_0001._1회기');
  const labelDir = path.join(root, 'Validation', '02.라벨링데이터', 'VL_002._불안장애_0001._1회기');
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.mkdirSync(labelDir, { recursive: true });
  fs.writeFileSync(path.join(sourceDir, 'resource_anxiety_1_check_A001.txt'), '내담자 : 불안해요\n');
  fs.writeFileSync(
    path.join(labelDir, 'label_anxiety_1_check_A001.json'),
    `{
      "filename": "label_anxiety_1_check_A001",
      "id": "A001",
      "depression": 0,
      "anxiety": 2,
      "addiction": 0,
      "class": "ANXIETY",
      "summary": 주요증상: 긴장,
      "paragraph": [{"cps": Infinity}]
    }`,
  );

  const summary = loadAihubRawDatasetSummary(root);

  assert.equal(summary.classCounts.ANXIETY, 1);
  assert.equal(summary.diagnosisScoreDistributions.anxiety['2'], 1);
  assert.equal(summary.nonStandardLabelJsonCount, 1);
  assert.equal(summary.invalidLabelJsonCount, 0);
});
