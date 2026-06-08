import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSessionProfile } from '../src/sessionState.js';

test('buildSessionProfile starts in opening phase with symptoms but no premature diagnosis', () => {
  const profile = buildSessionProfile([
    { role: 'user', content: '요즘 불안해서 잠을 잘 못 자요.' },
  ]);

  assert.equal(profile.turnCount, 1);
  assert.equal(profile.phase, 'opening');
  assert.ok(profile.signals.symptoms.includes('anxiety'));
  assert.ok(profile.signals.symptoms.includes('sleep'));
  assert.equal(profile.aihubLabels.majorSymptoms.score, 2);
  assert.equal(profile.aihubLabels.riskFactors.score, 0);
  assert.equal(profile.primaryHypothesis.key, 'anxiety');
  assert.equal(profile.primaryHypothesis.confidence, 'tentative');
});

test('buildSessionProfile integrates repeated symptoms, duration, and functional impairment over turns', () => {
  const profile = buildSessionProfile([
    { role: 'user', content: '요즘 불안해서 잠을 잘 못 자요.' },
    { role: 'assistant', content: '잠들려고 할 때 불안이 올라오는군요.' },
    { role: 'user', content: '3주째 거의 매일 그래요.' },
    { role: 'assistant', content: '꽤 오래 이어지고 있네요.' },
    { role: 'user', content: '출근도 자꾸 못 하고 있어요.' },
  ]);

  assert.equal(profile.turnCount, 3);
  assert.equal(profile.phase, 'integrating');
  assert.equal(profile.signals.duration.present, true);
  assert.equal(profile.signals.functionalImpact.present, true);
  assert.equal(profile.aihubLabels.majorSymptoms.score, 3);
  assert.equal(profile.aihubLabels.riskFactors.score, 2);
  assert.equal(profile.aihubLabels.interventionFactors.score, 2);
  assert.equal(profile.primaryHypothesis.key, 'anxiety');
  assert.equal(profile.primaryHypothesis.confidence, 'moderate');
  assert.equal(profile.hypotheses.find((item) => item.key === 'depression').confidence, 'tentative');
  assert.equal(profile.hypotheses.find((item) => item.key === 'addiction').score, 0);
  assert.equal(profile.hypotheses.find((item) => item.key === 'grief').score, 0);
});

test('buildSessionProfile tracks protective and improvement factors from later disclosures', () => {
  const profile = buildSessionProfile([
    { role: 'user', content: '요즘 너무 불안하고 잠도 못 자요.' },
    { role: 'assistant', content: '불안이 밤에 커지는군요.' },
    { role: 'user', content: '그래도 친구에게 말했더니 조금 나아졌어요.' },
  ]);

  assert.equal(profile.phase, 'exploring');
  assert.ok(profile.signals.protectiveFactors.includes('social_support'));
  assert.ok(profile.signals.improvementFactors.includes('relief_after_talking'));
  assert.equal(profile.aihubLabels.improvementFactors.score, 2);
});
