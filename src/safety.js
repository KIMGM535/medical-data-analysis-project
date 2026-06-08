const crisisPatterns = [
  {
    signal: 'self_harm',
    patterns: [
      /죽고\s*싶/i,
      /자살(하고\s*싶|하고싶|할\s*것|할거|하려|하겠|생각|충동|시도)/i,
      /스스로.*해치/i,
      /목숨.*끊/i,
      /목\s*매달|목을\s*매|목매달/i,
      /극단적\s*선택/i,
    ],
  },
  {
    signal: 'self_harm_method',
    patterns: [/수면제.*(몇|얼마|많이|죽|치사량)/i, /약.*(몇|얼마|많이|죽|치사량|과다복용)/i, /치사량/i, /과다복용/i],
  },
  { signal: 'harm_to_others', patterns: [/죽이고\s*싶/i, /해치고\s*싶/i, /폭력.*충동/i] },
  { signal: 'psychosis_or_disorientation', patterns: [/환청/i, /환각/i, /누가.*조종/i, /현실.*구분.*안/i] },
];

const conditionSignals = {
  depression: [/우울/i, /무기력/i, /잠.*안/i, /불면/i, /식욕/i, /의욕.*없/i, /희망.*없/i, /죄책감/i],
  anxiety: [/불안/i, /공황/i, /숨.*답답/i, /가슴.*답답/i, /걱정/i, /초조/i, /두려/i, /긴장/i, /잠.*못/i],
  addiction: [/술/i, /알코올/i, /도박/i, /마약/i, /중독/i, /끊.*못/i, /계속.*마시/i, /충동/i],
};

const severitySignals = [
  { weight: 35, patterns: [/죽고\s*싶/i, /자살/i, /해치/i] },
  { weight: 25, patterns: [/매일/i, /계속/i, /몇\s*주/i, /몇\s*달/i] },
  { weight: 20, patterns: [/일상.*못/i, /출근.*못/i, /학교.*못/i, /관계.*망/i] },
  { weight: 15, patterns: [/잠.*안/i, /불면/i, /식욕/i, /숨.*답답/i] },
  { weight: 10, patterns: [/피곤/i, /예민/i, /스트레스/i, /힘들/i] },
];

export function detectCrisis(text = '') {
  const signals = [];
  const bereavementBySuicide = isBereavementBySuicide(text);

  for (const item of crisisPatterns) {
    if (bereavementBySuicide && item.signal === 'self_harm') {
      continue;
    }
    if (item.patterns.some((pattern) => pattern.test(text))) {
      signals.push(item.signal);
    }
  }

  return {
    isCrisis: signals.length > 0,
    level: signals.length > 0 ? 'urgent' : 'none',
    signals,
  };
}

export function estimateSeverity(text = '') {
  const crisis = detectCrisis(text);
  if (crisis.isCrisis) {
    return {
      level: 'urgent',
      score: 95,
      reasons: crisis.signals,
    };
  }

  let score = 0;
  const reasons = [];

  for (const signal of severitySignals) {
    if (isBereavementBySuicide(text) && signal.patterns.some((pattern) => pattern.source === '자살')) {
      continue;
    }
    const matched = signal.patterns.some((pattern) => pattern.test(text));
    if (matched) {
      score += signal.weight;
      reasons.push(signal.patterns[0].source);
    }
  }

  const level = score >= 70 ? 'high' : score >= 35 ? 'medium' : 'low';
  return { level, score, reasons };
}

export function isBereavementBySuicide(text = '') {
  const suicideDeath = '(자살|극단적\\s*선택|목\\s*매달(?:아|아서|았|고)?\\s*죽|목매달(?:아|아서|았|고)?\\s*죽|목을\\s*매.{0,6}죽)';
  const person = '(친구|지인|가족|동료|선배|후배|애인|사람)';
  return new RegExp(`${person}.{0,12}${suicideDeath}.{0,16}(소식|들었|했다|했대|했다는|사망|죽었)`, 'i').test(text)
    || new RegExp(`${suicideDeath}.{0,16}(소식|들었|했다는).{0,16}${person}`, 'i').test(text);
}

export function estimateConditions(text = '') {
  const scored = Object.fromEntries(
    Object.entries(conditionSignals).map(([key, patterns]) => {
      const count = patterns.filter((pattern) => pattern.test(text)).length;
      return [key, conditionResult(key, count)];
    }),
  );

  const symptomTotal = Object.values(scored).reduce((sum, item) => sum + item.score, 0);

  return {
    depression: scored.depression,
    anxiety: scored.anxiety,
    addiction: scored.addiction,
    general: symptomTotal === 0 ? { score: 65, level: 'medium' } : { score: 15, level: 'low' },
  };
}

export function sanitizeClinicalLanguage(text = '') {
  return text
    .replace(/당신은\s*우울증입니다\.?/g, '우울 관련 신호가 나타날 수 있습니다.')
    .replace(/당신은\s*불안장애입니다\.?/g, '불안 관련 신호가 나타날 수 있습니다.')
    .replace(/당신은\s*중독입니다\.?/g, '중독 관련 신호가 나타날 수 있습니다.')
    .replace(/치료가\s*완료됩니다\.?/g, '상담 보조 과정에서 완화를 도울 수 있습니다.')
    .replace(/약을\s*복용하세요\.?/g, '약물 관련 결정은 의료 전문가와 상의하세요.');
}

export function buildSafetyNotice(level) {
  if (level === 'urgent') {
    return {
      priority: 'emergency',
      title: '즉각적인 안전 확인이 필요합니다',
      message:
        '지금 혼자 있지 말고 가까운 사람에게 연락하세요. 한국에서는 자살예방상담전화 109 또는 응급상황 119에 바로 도움을 요청할 수 있습니다.',
    };
  }

  if (level === 'high') {
    return {
      priority: 'professional',
      title: '전문가 상담을 권합니다',
      message: '증상이 강하게 지속되는 신호가 있어 정신건강 전문가나 의료기관 상담을 권합니다.',
    };
  }

  return {
    priority: 'self_care',
    title: '상담 보조를 계속 진행할 수 있습니다',
    message: '현재 대화에서는 즉각적인 위기 신호가 뚜렷하지 않습니다. 감정과 상황을 더 구체화해 보겠습니다.',
  };
}

function conditionResult(key, count) {
  if (key === 'addiction' && count === 2) return { score: 52, level: 'medium' };
  if (count >= 2) return { score: 78, level: 'high' };
  if (count === 1) return { score: 48, level: 'medium' };
  return { score: 12, level: 'low' };
}
