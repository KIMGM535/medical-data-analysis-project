import test from 'node:test';
import assert from 'node:assert/strict';
import * as uiBehavior from '../public/uiBehavior.js';

const {
  formatRagConditionSummary,
  formatConfidenceLabel,
  getApiBase,
  getInsightToggleLabel,
  getThinkingDelayMs,
  shouldSubmitOnKeydown,
} = uiBehavior;

test('shouldSubmitOnKeydown submits Enter without Shift', () => {
  assert.equal(shouldSubmitOnKeydown({ key: 'Enter', shiftKey: false, isComposing: false }), true);
});

test('shouldSubmitOnKeydown allows Shift Enter and Korean composition', () => {
  assert.equal(shouldSubmitOnKeydown({ key: 'Enter', shiftKey: true, isComposing: false }), false);
  assert.equal(shouldSubmitOnKeydown({ key: 'Enter', shiftKey: false, isComposing: true }), false);
});

test('getThinkingDelayMs creates a human-feeling minimum delay', () => {
  assert.equal(getThinkingDelayMs('짧은 말'), 1300);
  assert.equal(getThinkingDelayMs('조금 더 긴 말을 했을 때 상담사가 바로 튀어나오지 않게 기다립니다.') > 1300, true);
  assert.equal(getThinkingDelayMs('x'.repeat(1000)), 3200);
});

test('getThinkingDelayMs keeps urgent-risk wording from waiting too long', () => {
  assert.equal(getThinkingDelayMs('나 지금 죽고 싶어'), 900);
  assert.equal(getThinkingDelayMs('수면제 몇 알을 먹으면 죽을 수 있어?'), 900);
});

test('getInsightToggleLabel maps panel visibility to a calm control label', () => {
  assert.equal(getInsightToggleLabel(true), '분석 숨김');
  assert.equal(getInsightToggleLabel(false), '분석 보기');
});

test('getApiBase keeps the app usable when index.html is opened directly', () => {
  assert.equal(getApiBase({ protocol: 'http:', host: 'localhost:5173' }), '');
  assert.equal(getApiBase({ protocol: 'https:', host: 'example.com' }), '');
  assert.equal(getApiBase({ protocol: 'file:', host: '' }), 'http://127.0.0.1:5173');
});

test('formatRagConditionSummary maps internal AIHub class labels to user-facing Korean text', () => {
  const summary = formatRagConditionSummary([
    { condition: 'ANXIETY', count: 2 },
    { condition: 'DEPRESSION', count: 1 },
  ]);

  assert.equal(summary, '불안 관련 2건, 우울 관련 1건');
  assert.doesNotMatch(summary, /ANXIETY|DEPRESSION/);
});

test('formatRagConditionSummary prefers server-provided Korean condition labels', () => {
  const summary = formatRagConditionSummary([{ condition: 'CUSTOM_SLEEP_ANXIETY', label: '수면/불안 관련', count: 3 }]);

  assert.equal(summary, '수면/불안 관련 3건');
  assert.doesNotMatch(summary, /CUSTOM_SLEEP_ANXIETY/);
});

test('formatRagConditionSummary falls back calmly when there are no matched conditions', () => {
  assert.equal(formatRagConditionSummary([]), '조건 분포 없음');
  assert.equal(formatRagConditionSummary(null), '조건 분포 없음');
});

test('formatConfidenceLabel maps internal hypothesis confidence to Korean status text', () => {
  assert.equal(formatConfidenceLabel('tentative'), '초기 가설');
  assert.equal(formatConfidenceLabel('moderate'), '누적 근거 있음');
  assert.equal(formatConfidenceLabel('unknown'), '추정 중');
});

test('formatReportSummaryLines includes user and counselor summaries without raw internal labels', () => {
  const lines = uiBehavior.formatReportSummaryLines?.({
    userTurnCount: 2,
    boundary: '확정 진단이 아닌 대화 기반 가능성 및 위험도 추정입니다.',
    display: {
      currentHypothesisText: '불안 가능성 (초기 가설)',
      intensityText: '지원 강도 중간',
    },
    userSummary: {
      text: '현재까지는 불안 가능성을 조심스럽게 보고 있고, 지원 강도 중간으로 정리됩니다.',
      resourceText: '확인된 도움 신호는 사회적 지지, 대화 후 완화입니다. 이 신호는 회복 자원으로 참고하되 현재 강도 판단을 대신하지 않습니다.',
      nextStepText: '다음에는 잠들기 전 불안이 올라오는 순간을 한 문장으로 적습니다.',
    },
    counselorReview: {
      phase: 'exploring',
      protectiveFactorSummary: '보호/개선 요인: 사회적 지지, 대화 후 완화',
      ragSupportText: '불안 관련 1건',
      aihubLabelSummary: '주요 증상 2, 위험 요인 1, 개선 요인 0, 개입 요인 1',
    },
  }) ?? [];

  assert.ok(lines.some((line) => line.includes('사용자용 요약')));
  assert.ok(lines.some((line) => line.includes('도움 신호')));
  assert.ok(lines.some((line) => line.includes('보호/개선 요인')));
  assert.ok(lines.some((line) => line.includes('상담자 검토')));
  assert.ok(lines.some((line) => line.includes('AIHub 라벨')));
  assert.doesNotMatch(lines.join('\n'), /ANXIETY|sleep_disturbance|회사에서 있었던 일/);
});
