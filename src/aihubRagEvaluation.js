import { buildAihubRagContext } from './aihubRag.js';

export const defaultRagEvaluationScenarios = [
  {
    id: 'anxiety_sleep',
    input: '요즘 불안하고 잠을 거의 못 자요. 누우면 가슴이 뛰어요.',
    expectedTopCondition: 'ANXIETY',
    expectedQueryFeatures: ['sleep_disturbance', 'anxiety'],
  },
  {
    id: 'depressed_withdrawal',
    input: '아무것도 하기 싫고 무기력해서 사람도 피하게 돼요.',
    expectedTopCondition: 'DEPRESSION',
    expectedQueryFeatures: ['depression'],
  },
  {
    id: 'addiction_craving',
    input: '술을 끊으려고 했는데 또 마시고 싶고 조절이 안 돼요.',
    expectedTopCondition: 'ADDICTION',
    expectedQueryFeatures: ['addiction'],
  },
  {
    id: 'work_stress_sleep',
    input: '회사 일 때문에 압박감이 심하고 밤에 잠이 잘 안 와요.',
    expectedQueryFeatures: ['sleep_disturbance', 'stressful_event'],
  },
  {
    id: 'bereavement_by_suicide',
    input: '친구가 자살했다는 소식을 듣고 계속 비현실적이에요.',
    expectedQueryFeatures: ['stressful_event', 'grief'],
  },
  {
    id: 'trauma_intrusion',
    input: '성폭행 당했던 기억이 자꾸 떠오르고 몸이 내 몸 같지 않아요.',
    expectedQueryFeatures: ['trauma'],
  },
  {
    id: 'panic_somatic',
    input: '갑자기 숨이 막히고 심장이 빨리 뛰어서 무서워요.',
    expectedTopCondition: 'ANXIETY',
    expectedQueryFeatures: ['anxiety'],
  },
  {
    id: 'ordinary_relationship_stress',
    input: '친구랑 관계가 틀어진 뒤로 계속 신경 쓰이고 힘들어요.',
    expectedQueryFeatures: ['stressful_event'],
  },
];

export function evaluateAihubRagParity({
  rawIndex,
  deployableIndex,
  scenarios = defaultRagEvaluationScenarios,
  limit = 3,
} = {}) {
  const scenarioResults = scenarios.map((scenario) => evaluateScenario({ rawIndex, deployableIndex, scenario, limit }));
  const issues = scenarioResults.flatMap((result) => result.issues);
  const expectedTopConditionResults = scenarioResults.filter((result) => Boolean(result.expectedTopCondition));
  const expectedTopConditionHitCount = countWhere(expectedTopConditionResults, (result) => result.expectedTopConditionHit);

  return {
    ok: issues.length === 0,
    scenarioCount: scenarioResults.length,
    rawMatchedCount: countWhere(scenarioResults, (result) => result.raw.available),
    deployableMatchedCount: countWhere(scenarioResults, (result) => result.deployable.available),
    topConditionAgreementCount: countWhere(scenarioResults, (result) => result.topConditionAgreement),
    topConditionAgreementRate: rate(countWhere(scenarioResults, (result) => result.topConditionAgreement), scenarioResults.length),
    queryFeatureAgreementCount: countWhere(scenarioResults, (result) => result.queryFeatureAgreement),
    queryFeatureAgreementRate: rate(countWhere(scenarioResults, (result) => result.queryFeatureAgreement), scenarioResults.length),
    expectedTopConditionCount: expectedTopConditionResults.length,
    expectedTopConditionHitCount,
    expectedTopConditionHitRate: rate(expectedTopConditionHitCount, expectedTopConditionResults.length),
    expectedQueryFeatureHitCount: countWhere(scenarioResults, (result) => result.expectedQueryFeatureHit),
    expectedQueryFeatureHitRate: rate(countWhere(scenarioResults, (result) => result.expectedQueryFeatureHit), scenarioResults.length),
    issues,
    scenarios: scenarioResults,
  };
}

function evaluateScenario({ rawIndex, deployableIndex, scenario, limit }) {
  const messages = [{ role: 'user', content: scenario.input }];
  const raw = summarizeContext(buildAihubRagContext(rawIndex, { messages, limit }));
  const deployable = summarizeContext(buildAihubRagContext(deployableIndex, { messages, limit }));
  const topConditionAgreement = raw.topCondition === deployable.topCondition;
  const queryFeatureAgreement = sameStringSet(raw.queryFeatures, deployable.queryFeatures);
  const expectedTopConditionHit = scenario.expectedTopCondition ? deployable.topCondition === scenario.expectedTopCondition : true;
  const expectedQueryFeatureHit = (scenario.expectedQueryFeatures ?? []).every((feature) => deployable.queryFeatures.includes(feature));
  const issues = [];

  if (!topConditionAgreement) {
    issues.push({
      scenarioId: scenario.id,
      reason: 'top_condition_mismatch',
      rawTopCondition: raw.topCondition,
      deployableTopCondition: deployable.topCondition,
    });
  }
  if (!queryFeatureAgreement) {
    issues.push({
      scenarioId: scenario.id,
      reason: 'query_feature_mismatch',
      rawQueryFeatures: raw.queryFeatures,
      deployableQueryFeatures: deployable.queryFeatures,
    });
  }
  if (scenario.expectedTopCondition && !expectedTopConditionHit) {
    issues.push({
      scenarioId: scenario.id,
      reason: 'expected_top_condition_miss',
      expectedTopCondition: scenario.expectedTopCondition,
      deployableTopCondition: deployable.topCondition,
    });
  }
  if (!expectedQueryFeatureHit) {
    issues.push({
      scenarioId: scenario.id,
      reason: 'expected_query_feature_miss',
      expectedQueryFeatures: scenario.expectedQueryFeatures,
      deployableQueryFeatures: deployable.queryFeatures,
    });
  }

  return {
    id: scenario.id,
    input: scenario.input,
    expectedTopCondition: scenario.expectedTopCondition,
    expectedQueryFeatures: scenario.expectedQueryFeatures ?? [],
    raw,
    deployable,
    topConditionAgreement,
    queryFeatureAgreement,
    expectedTopConditionHit,
    expectedQueryFeatureHit,
    issues,
  };
}

function summarizeContext(context) {
  return {
    available: context.available,
    queryFeatures: context.queryFeatures,
    matchCount: context.matches.length,
    topCondition: context.matches[0]?.condition ?? null,
    topScore: context.matches[0]?.score ?? 0,
    matchedConditions: context.matches.map((match) => match.condition),
  };
}

function countWhere(items, predicate) {
  return items.filter(predicate).length;
}

function rate(numerator, denominator) {
  return denominator > 0 ? Number((numerator / denominator).toFixed(4)) : 1;
}

function sameStringSet(a = [], b = []) {
  if (a.length !== b.length) return false;
  const bSet = new Set(b);
  return a.every((item) => bSet.has(item));
}
