import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildCounselorStyleGuidance, loadCounselorStyleProfile } from '../src/counselorStyle.js';

test('loadCounselorStyleProfile learns counselor turn patterns and Rogerian labels', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aihub-style-'));
  const sourceDir = path.join(root, 'Training', '01.원천데이터', 'TS_001._우울증_0001._1회기');
  const labelDir = path.join(root, 'Training', '02.라벨링데이터', 'TL_001._우울증_0001._1회기');
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.mkdirSync(labelDir, { recursive: true });
  fs.writeFileSync(
    path.join(sourceDir, 'resource_depression_1_check_D001.txt'),
    [
      '상담사 : 많이 지쳐 있었던 것 같아요. 그 순간 가장 먼저 든 감정은 무엇이었나요?',
      '내담자 : 잠을 못 자고 불안했어요.',
      '상담사 : 잠을 못 자고 불안했던 시간이 꽤 길었군요.',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(labelDir, 'label_depression_1_check_D001.json'),
    JSON.stringify({
      class: 'DEPRESSION',
      paragraph: [
        {
          paragraph_speaker: '상담사',
          paragraph_text: '많이 지쳐 있었던 것 같아요. 그 순간 가장 먼저 든 감정은 무엇이었나요?',
          sympathy_support: 2,
          clarification_reflection: 1,
          structuring: 1,
        },
        {
          paragraph_speaker: '내담자',
          paragraph_text: '잠을 못 자고 불안했어요.',
          sleep_disturbance: 2,
        },
        {
          paragraph_speaker: '상담사',
          paragraph_text: '잠을 못 자고 불안했던 시간이 꽤 길었군요.',
          clarification_reflection: 2,
        },
      ],
    }),
  );

  const profile = loadCounselorStyleProfile(root);

  assert.equal(profile.available, true);
  assert.equal(profile.counselorTurnCount, 2);
  assert.equal(profile.clientTurnCount, 1);
  assert.equal(profile.questionTurnCount, 1);
  assert.equal(profile.interventionCounts.sympathy_support, 1);
  assert.equal(profile.interventionCounts.clarification_reflection, 2);
  assert.equal(profile.rogerianEvidence.empathicUnderstanding.count, 1);
  assert.equal(profile.rogerianEvidence.accurateReflection.count, 2);
  assert.equal(profile.primaryCounselorMoves[0].label, 'clarification_reflection');

  const guidance = buildCounselorStyleGuidance(profile);
  assert.match(guidance, /실제 상담사 대화 학습/);
  assert.match(guidance, /공감적 이해/);
  assert.match(guidance, /명료화와 반영/);
});
