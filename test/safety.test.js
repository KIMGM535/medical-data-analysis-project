import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSafetyNotice,
  detectCrisis,
  estimateConditions,
  estimateSeverity,
  sanitizeClinicalLanguage,
} from '../src/safety.js';

test('detectCrisis escalates direct self-harm intent', () => {
  const result = detectCrisis('더는 못 버티겠고 오늘 죽고 싶다는 생각이 계속 들어요.');

  assert.equal(result.level, 'urgent');
  assert.equal(result.isCrisis, true);
  assert.ok(result.signals.includes('self_harm'));
});

test('detectCrisis escalates overdose method questions', () => {
  const result = detectCrisis('수면제 몇 알을 먹으면 바로 죽을 수 있어?');

  assert.equal(result.level, 'urgent');
  assert.equal(result.isCrisis, true);
  assert.ok(result.signals.includes('self_harm_method'));
});

test('detectCrisis does not treat bereavement by suicide as the user self-harm intent', () => {
  const crisis = detectCrisis('친구가 자살했다는 소식을 들었을 때요');
  const severity = estimateSeverity('친구가 자살했다는 소식을 들었을 때요');

  assert.equal(crisis.isCrisis, false);
  assert.equal(crisis.level, 'none');
  assert.equal(severity.level, 'low');
});

test('detectCrisis does not treat another person hanging death as the user self-harm intent', () => {
  const crisis = detectCrisis('친구가 목매달아 죽었다는 소식을 들었어요.');
  const severity = estimateSeverity('친구가 목매달아 죽었다는 소식을 들었어요.');

  assert.equal(crisis.isCrisis, false);
  assert.equal(crisis.level, 'none');
  assert.equal(severity.level, 'low');
});

test('estimateSeverity keeps ordinary stress below urgent', () => {
  const result = estimateSeverity('요즘 일이 많아서 피곤하고 예민하지만 일상은 하고 있어요.');

  assert.equal(result.level, 'low');
  assert.ok(result.score < 35);
});

test('sanitizeClinicalLanguage removes diagnosis and cure claims', () => {
  const text = sanitizeClinicalLanguage('당신은 우울증입니다. 이 치료가 완료됩니다. 약을 복용하세요.');

  assert.equal(text.includes('우울증입니다'), false);
  assert.equal(text.includes('치료가 완료됩니다'), false);
  assert.equal(text.includes('약을 복용하세요'), false);
  assert.ok(text.includes('우울 관련 신호가 나타날 수 있습니다'));
});

test('estimateConditions identifies anxiety, depression, and addiction signals', () => {
  const result = estimateConditions('불안하고 숨이 답답해요. 잠도 안 오고 술을 계속 마시게 됩니다.');

  assert.equal(result.anxiety.level, 'high');
  assert.equal(result.depression.level, 'medium');
  assert.equal(result.addiction.level, 'medium');
  assert.equal(result.general.level, 'low');
});

test('buildSafetyNotice prioritizes emergency guidance for urgent risk', () => {
  const notice = buildSafetyNotice('urgent');

  assert.equal(notice.priority, 'emergency');
  assert.match(notice.message, /109|119/);
});
