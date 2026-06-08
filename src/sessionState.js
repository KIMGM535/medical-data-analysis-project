import { detectCrisis, isBereavementBySuicide } from './safety.js';

export function buildSessionProfile(messages = []) {
  const userTexts = messages.filter((message) => message.role === 'user').map((message) => message.content ?? '');
  const fullText = userTexts.join('\n');
  const signals = buildSignals(fullText);
  const aihubLabels = buildAihubLabels(signals);
  const phase = phaseFor(userTexts.length, signals, aihubLabels);
  const hypotheses = buildHypotheses(signals, phase);

  return {
    turnCount: userTexts.length,
    phase,
    signals,
    aihubLabels,
    hypotheses,
    primaryHypothesis: hypotheses[0] ?? { key: 'general', label: '일반 스트레스', confidence: 'tentative', score: 0 },
  };
}

function buildSignals(text) {
  const crisis = detectCrisis(text);
  const symptoms = unique([
    match(text, /불안|걱정|초조|긴장|공황|가슴.*답답|숨.*답답/i) ? 'anxiety' : null,
    match(text, /잠|불면|못\s*자|잠을\s*잘\s*못/i) ? 'sleep' : null,
    match(text, /우울|무기력|의욕.*없|희망.*없|죄책감/i) ? 'depression' : null,
    isBereavementBySuicide(text) || match(text, /상실|사별|죽었다는\s*소식|세상을\s*떠/i) ? 'grief' : null,
    match(text, /술|알코올|도박|마약|중독|충동/i) ? 'addiction_or_impulse' : null,
    isManicActivationText(text) ? 'manic_activation' : null,
    isTraumaResponseText(text) ? 'trauma' : null,
    match(text, /화가|분노|짜증|시발|씨발|억울/i) ? 'anger' : null,
  ]);

  const duration = {
    present: match(text, /\d+\s*(일|주|달|개월)|몇\s*(일|주|달|개월)|매일|계속|오래|한\s*달|3주째|몇\s*주째/i),
    evidence: firstMatch(text, [/\d+\s*(일|주|달|개월)/i, /몇\s*(일|주|달|개월)/i, /매일|계속|오래|한\s*달|3주째|몇\s*주째/i]),
  };
  const functionalImpact = {
    present: match(text, /출근.*못|학교.*못|일상.*못|일.*못|못\s*하고|못하고|무너|관계.*망|생활.*안/i),
    evidence: firstMatch(text, [/출근.*못|학교.*못|일상.*못|일.*못/i, /못\s*하고|못하고|무너|관계.*망|생활.*안/i]),
  };

  const riskFactors = unique([
    crisis.isCrisis ? 'direct_crisis_signal' : null,
    duration.present ? 'persistent_duration' : null,
    functionalImpact.present ? 'functional_impairment' : null,
    match(text, /혼자|고립|아무도|기댈.*없/i) ? 'isolation' : null,
    match(text, /수면제|치사량|과다복용/i) ? 'means_or_method' : null,
  ]);
  const protectiveFactors = unique([
    match(text, /친구에게|가족에게|연락|말했|털어놨|상담|도움/i) ? 'social_support' : null,
    match(text, /병원|상담센터|치료|예약/i) ? 'professional_support' : null,
  ]);
  const improvementFactors = unique([
    match(text, /나아졌|괜찮아졌|좋아졌|편해졌|덜\s*힘들|조금\s*괜찮/i) ? 'relief_after_talking' : null,
    protectiveFactors.length > 0 ? 'connection' : null,
  ]);

  return {
    symptoms,
    duration,
    functionalImpact,
    riskFactors,
    protectiveFactors,
    improvementFactors,
    crisisSignals: crisis.signals,
  };
}

function buildAihubLabels(signals) {
  const majorSymptomBase = Math.min(3, signals.symptoms.length);
  const majorSymptoms = signals.duration.present && signals.functionalImpact.present && majorSymptomBase >= 2
    ? 3
    : majorSymptomBase;
  const riskFactors = Math.min(3, signals.riskFactors.filter((factor) => factor !== 'direct_crisis_signal').length + (signals.crisisSignals.length ? 3 : 0));
  const improvementFactors = Math.min(3, signals.improvementFactors.length);
  const interventionFactors = signals.crisisSignals.length
    ? 3
    : signals.functionalImpact.present
      ? 2
      : majorSymptoms >= 2 || signals.duration.present
        ? 1
        : 0;

  return {
    majorSymptoms: labelScore(majorSymptoms, evidenceForMajorSymptoms(signals)),
    riskFactors: labelScore(riskFactors, signals.riskFactors),
    improvementFactors: labelScore(improvementFactors, signals.improvementFactors),
    interventionFactors: labelScore(interventionFactors, interventionEvidence(signals, interventionFactors)),
  };
}

function buildHypotheses(signals, phase) {
  const scores = {
    anxiety: scoreFor(signals, ['anxiety', 'sleep']),
    depression: scoreFor(signals, ['depression']),
    addiction: scoreFor(signals, ['addiction_or_impulse']),
    grief: scoreFor(signals, ['grief']),
    manic_activation: scoreFor(signals, ['manic_activation']) + (signals.symptoms.includes('manic_activation') ? 1 : 0),
    trauma: scoreFor(signals, ['trauma']) + (signals.symptoms.includes('trauma') ? 1 : 0),
    general: 1,
  };

  return Object.entries(scores)
    .map(([key, score]) => ({ key, label: hypothesisLabel(key), score, confidence: confidenceFor(score, phase, signals) }))
    .sort((a, b) => b.score - a.score);
}

function phaseFor(turnCount, signals, labels) {
  if (turnCount <= 1) return 'opening';
  if (turnCount >= 3 && (signals.duration.present || signals.functionalImpact.present || labels.majorSymptoms.score >= 3)) {
    return 'integrating';
  }
  return 'exploring';
}

function scoreFor(signals, symptomKeys) {
  let score = symptomKeys.filter((key) => signals.symptoms.includes(key)).length;
  if (score === 0) return 0;
  if (signals.duration.present) score += 1;
  if (signals.functionalImpact.present) score += 1;
  return score;
}

function confidenceFor(score, phase, signals) {
  if (phase === 'opening') return 'tentative';
  if (score >= 4 && signals.functionalImpact.present) return 'moderate';
  if (score >= 2 && phase === 'integrating') return 'moderate';
  return 'tentative';
}

function labelScore(score, evidence) {
  return { score: Math.max(0, Math.min(3, score)), evidence };
}

function evidenceForMajorSymptoms(signals) {
  return signals.symptoms;
}

function interventionEvidence(signals, score) {
  if (score === 0) return [];
  return unique([
    signals.crisisSignals.length ? 'crisis_support' : null,
    signals.functionalImpact.present ? 'daily_function_support' : null,
    signals.duration.present ? 'continued_monitoring' : null,
  ]);
}

function hypothesisLabel(key) {
  return {
    anxiety: '불안',
    depression: '우울',
    addiction: '중독/충동',
    grief: '상실/애도',
    manic_activation: '조증성 활성',
    trauma: '트라우마 반응',
    general: '일반 스트레스',
  }[key] ?? key;
}

function isManicActivationText(text = '') {
  const hasReducedSleep = /(\d+\s*일째|며칠째|계속).{0,12}(잠.*안\s*자|잠을\s*안\s*자|못\s*자)/i.test(text)
    || /(잠.*안\s*자|잠을\s*안\s*자|못\s*자).{0,12}(\d+\s*일째|며칠째|계속)/i.test(text);
  const hasActivation = /힘이\s*넘치|에너지|뭐든\s*할\s*수|자신감|말이\s*빨라|생각이\s*빨라|돈.*쓰|지출|과소비|투자/i.test(text);
  return hasReducedSleep && hasActivation;
}

function isTraumaResponseText(text = '') {
  return /(성폭행|성폭력|강간|성추행|추행|강제로|학대|맞았던|맞았|폭력|트라우마)/i.test(text)
    || /(기억|장면|악몽|플래시백|떠올|몸이\s*내\s*몸|현실감|멍해).{0,24}(자꾸|계속|무섭|떠올|멀어|없|같지)/i.test(text)
    || /(자꾸|계속|무섭|떠올|멀어|없|같지).{0,24}(기억|장면|악몽|플래시백|몸이\s*내\s*몸|현실감|멍해)/i.test(text);
}

function match(text, pattern) {
  return pattern.test(text);
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const found = text.match(pattern);
    if (found) return found[0];
  }
  return null;
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}
