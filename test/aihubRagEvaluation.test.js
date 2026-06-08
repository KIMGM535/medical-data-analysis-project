import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateAihubRagParity,
  defaultRagEvaluationScenarios,
} from '../src/aihubRagEvaluation.js';

test('defaultRagEvaluationScenarios cover core counseling RAG situations', () => {
  const ids = defaultRagEvaluationScenarios.map((scenario) => scenario.id);

  assert.ok(ids.includes('anxiety_sleep'));
  assert.ok(ids.includes('depressed_withdrawal'));
  assert.ok(ids.includes('addiction_craving'));
  assert.ok(ids.includes('bereavement_by_suicide'));
  assert.ok(ids.includes('trauma_intrusion'));
});

test('evaluateAihubRagParity compares raw and deployable RAG outputs by scenario', () => {
  const rawIndex = makeIndex([
    makeRecord({
      condition: 'ANXIETY',
      diagnosisScores: { depression: 0, anxiety: 2, addiction: 0 },
      sourceSignals: { anxiety: 2, sleep_disturbance: 2 },
      safeSummary: '불안과 수면 어려움 요약.',
      searchText: 'ANXIETY anxiety sleep_disturbance 불안 잠 수면',
    }),
  ]);
  const deployableIndex = makeIndex([
    makeRecord({
      condition: 'ANXIETY',
      diagnosisScores: { depression: 0, anxiety: 2, addiction: 0 },
      sourceSignals: { anxiety: 2, sleep_disturbance: 2 },
      safeSummary: '불안과 수면 어려움 요약.',
      searchText: 'ANXIETY anxiety sleep_disturbance 불안 잠 수면',
    }),
  ], 'deployable_summary_only');

  const result = evaluateAihubRagParity({
    rawIndex,
    deployableIndex,
    scenarios: [
      {
        id: 'anxiety_sleep',
        input: '요즘 불안하고 잠을 못 자요.',
        expectedTopCondition: 'ANXIETY',
        expectedQueryFeatures: ['anxiety', 'sleep_disturbance'],
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.scenarioCount, 1);
  assert.equal(result.rawMatchedCount, 1);
  assert.equal(result.deployableMatchedCount, 1);
  assert.equal(result.topConditionAgreementRate, 1);
  assert.equal(result.queryFeatureAgreementRate, 1);
  assert.equal(result.expectedTopConditionHitRate, 1);
  assert.deepEqual(result.issues, []);
});

test('evaluateAihubRagParity reports mismatches instead of hiding them', () => {
  const rawIndex = makeIndex([
    makeRecord({
      condition: 'ANXIETY',
      diagnosisScores: { depression: 0, anxiety: 2, addiction: 0 },
      sourceSignals: { anxiety: 2 },
      searchText: 'ANXIETY anxiety 불안',
    }),
  ]);
  const deployableIndex = makeIndex([
    makeRecord({
      condition: 'DEPRESSION',
      diagnosisScores: { depression: 2, anxiety: 0, addiction: 0 },
      sourceSignals: { depression: 2 },
      searchText: 'DEPRESSION depression 우울',
    }),
  ], 'deployable_summary_only');

  const result = evaluateAihubRagParity({
    rawIndex,
    deployableIndex,
    scenarios: [
      {
        id: 'anxiety_sleep',
        input: '요즘 불안하고 잠을 못 자요.',
        expectedTopCondition: 'ANXIETY',
        expectedQueryFeatures: ['anxiety', 'sleep_disturbance'],
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.equal(result.topConditionAgreementRate, 0);
  assert.ok(result.issues.some((issue) => issue.reason === 'top_condition_mismatch'));
});

function makeIndex(records, privacyMode = 'summary_only') {
  return {
    available: true,
    privacyMode,
    records,
  };
}

function makeRecord({
  condition,
  diagnosisScores,
  sourceSignals,
  safeSummary = '요약.',
  searchText,
}) {
  return {
    condition,
    diagnosisScores,
    diagnosisStrength: Math.max(...Object.values(diagnosisScores)),
    topClientLabels: Object.entries(sourceSignals).map(([label, score]) => ({ label, score })),
    topCounselorInterventions: [{ label: 'clarification_reflection', score: 2 }],
    sourceSignals,
    safeSummary,
    searchText,
  };
}
