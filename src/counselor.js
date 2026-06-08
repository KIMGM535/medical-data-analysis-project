import { buildKnowledgeContext, summarizeTrainingVideoNotes } from './knowledge.js';
import { classifyDialogueAct } from './dialogueAct.js';
import {
  buildSafetyNotice,
  detectCrisis,
  estimateConditions,
  estimateSeverity,
  isBereavementBySuicide,
  sanitizeClinicalLanguage,
} from './safety.js';
import { buildSessionProfile } from './sessionState.js';

const modeLabels = {
  free: '자유 상담',
  emotion: '감정 정리',
  cognitive: '인지재구성',
  action: '행동 계획',
  crisis: '위기 안정화',
};

export async function createCounselingTurn({
  messages = [],
  mode = 'free',
  inventory,
  trainingVideoNotes = null,
  rawDatasetSummary = null,
  counselorStyleProfile = null,
  aihubRagContext = null,
  aihubRagProvider = null,
  allowPrivateRagInLlmPrompt = false,
  llmClient,
  openai = {},
} = {}) {
  const latestUserText = latestUserMessage(messages);
  const crisis = detectCrisis(latestUserText);
  const recentCrisis = hasRecentCrisisContext(messages);
  const recentPassiveDeathWish = hasRecentPassiveDeathWishContext(messages);
  const recentAcuteViolence = hasRecentAcuteViolenceContext(messages);
  const recentPsychosis = hasRecentPsychosisContext(messages);
  const harmToOthersPlan = isHarmToOthersPlanText(latestUserText);
  const stalkingDanger = isStalkingDangerText(latestUserText);
  const minorSexualExploitation = isMinorSexualExploitationText(latestUserText);
  const alcoholWithdrawal = isAlcoholWithdrawalText(latestUserText);
  const minorUnsafe = isMinorUnsafeText(latestUserText);
  const selfInjuryRisk = isSelfInjuryRiskText(latestUserText);
  const coerciveDigitalMonitoring = isCoerciveDigitalMonitoringText(latestUserText);
  const followDeceasedRisk = isFollowDeceasedRiskText(latestUserText);
  const postpartumPsychosisRisk = isPostpartumPsychosisRiskText(latestUserText);
  const postpartumIntrusiveHarmThought = isPostpartumIntrusiveHarmThoughtText(latestUserText);
  const alreadyIngestedOverdose = isAlreadyIngestedOverdoseText(latestUserText);
  const strangulationMedicalRisk = isStrangulationMedicalRiskText(latestUserText);
  const cardiacWarningSigns = isCardiacWarningSignsText(latestUserText);
  const eatingDisorderMedicalRisk = isEatingDisorderMedicalRiskText(latestUserText);
  const imminentJumpLocationRisk = isImminentJumpLocationRiskText(latestUserText);
  const childAbuseCurrentRisk = isChildAbuseCurrentRiskText(latestUserText);
  const recentHarmToOthersPlan = hasRecentHarmToOthersPlanContext(messages);
  const recentStalkingDanger = hasRecentStalkingDangerContext(messages);
  const recentMinorSexualExploitation = hasRecentMinorSexualExploitationContext(messages);
  const recentAlcoholWithdrawal = hasRecentAlcoholWithdrawalContext(messages);
  const recentMinorUnsafe = hasRecentMinorUnsafeContext(messages);
  const recentSelfInjuryRisk = hasRecentSelfInjuryRiskContext(messages);
  const recentCoerciveDigitalMonitoring = hasRecentCoerciveDigitalMonitoringContext(messages);
  const selfInjuryMeansAccessible = recentSelfInjuryRisk && isSelfInjuryMeansAccessibleText(latestUserText);
  const recentDigitalSexualExtortion = hasRecentDigitalSexualExtortionContext(messages);
  const recentSexualAssault = hasRecentSexualAssaultContext(messages);
  const recentEatingDisorderHarm = hasRecentEatingDisorderHarmContext(messages);
  const recentManicActivation = hasRecentManicActivationContext(messages);
  const harmToOthersFollowUpEscalation = recentHarmToOthersPlan && isHarmToOthersFollowUpEscalationText(latestUserText);
  const dialogueAct = classifyDialogueAct({ latestUserText, messages });
  const sessionProfile = buildSessionProfile(messages);
  const severity = buildCumulativeSeverity({
    latestSeverity: estimateSeverity(latestUserText),
    sessionProfile,
    recentCrisis,
    crisis,
    dialogueAct,
    recentPassiveDeathWish,
    recentAcuteViolence,
    harmToOthersPlan,
    stalkingDanger,
    minorSexualExploitation,
    alcoholWithdrawal,
    minorUnsafe,
    selfInjuryRisk,
    coerciveDigitalMonitoring,
    followDeceasedRisk,
    postpartumPsychosisRisk,
    postpartumIntrusiveHarmThought,
    alreadyIngestedOverdose,
    strangulationMedicalRisk,
    cardiacWarningSigns,
    eatingDisorderMedicalRisk,
    imminentJumpLocationRisk,
    childAbuseCurrentRisk,
    recentHarmToOthersPlan,
    recentStalkingDanger,
    recentMinorSexualExploitation,
    recentAlcoholWithdrawal,
    recentMinorUnsafe,
    recentSelfInjuryRisk,
    recentCoerciveDigitalMonitoring,
    selfInjuryMeansAccessible,
    harmToOthersFollowUpEscalation,
  });
  const conditions = buildCumulativeConditions(sessionProfile, estimateConditions(latestUserText));
  const safety = buildSafetyNotice(severity.level);
  const skipRagForSafety = shouldSkipRagForSafety({
    severity,
    recentPsychosis,
    recentAlcoholWithdrawal,
    recentHarmToOthersPlan,
    recentSelfInjuryRisk,
    recentCrisis,
  });
  const resolvedAihubRagContext = skipRagForSafety
    ? skippedRagContext('safety_first')
    : aihubRagContext ?? (aihubRagProvider ? await safeRagProvider(aihubRagProvider, messages) : null);
  const ragAssessment = summarizeRagAssessment(resolvedAihubRagContext);
  const aihubContext = inventory
    ? buildKnowledgeContext(inventory, trainingVideoNotes, rawDatasetSummary, counselorStyleProfile)
    : 'AIHub 인벤토리가 아직 로드되지 않았습니다.';
  const modelGuidance = trainingVideoNotes ? buildModelGuidance(trainingVideoNotes) : '영상 기반 모델 가이드가 아직 연결되지 않았습니다.';
  const evidenceBase = {
    aihubContext,
    modelGuidance,
    ...(resolvedAihubRagContext ? { aihubRagContext: publicRagEvidence(resolvedAihubRagContext) } : {}),
  };

  const assessment = {
    conditions,
    severity,
    sessionProfile,
    dialogueAct: summarizeDialogueAct(dialogueAct),
    aihubRag: ragAssessment,
    crisisSignals: recentCrisis && !crisis.isCrisis ? ['recent_self_harm_context'] : crisis.signals,
    clinicalBoundary: '확정 진단이 아닌 대화 기반 가능성 및 위험도 추정입니다.',
  };

  if (dialogueAct.type === 'relationship_rupture') {
    const repair = buildRepairTurn({ latestUserText, messages });
    return withCounselingReport({
      assistantMessage: repair.assistantMessage,
      assessment: {
        ...assessment,
        severity: crisis.isCrisis ? assessment.severity : estimateSeverity(latestUserText),
        crisisSignals: crisis.signals,
      },
      safety: buildSafetyNotice(crisis.isCrisis ? assessment.severity.level : estimateSeverity(latestUserText).level),
      actions: repair.actions,
      session: repair.session,
      evidence: evidenceBase,
      source: 'repair',
    }, { messages, aihubRagContext: resolvedAihubRagContext });
  }

  if (severity.level === 'urgent') {
    const harmToOthersContext = harmToOthersPlan || harmToOthersFollowUpEscalation;
    const stalkingContext = stalkingDanger || recentStalkingDanger;
    const minorSexualExploitationContext = minorSexualExploitation || recentMinorSexualExploitation;
    const violenceContext = dialogueAct.type === 'acute_violence' || recentAcuteViolence;
    const minorUnsafeContext = minorUnsafe || recentMinorUnsafe;
    const alcoholWithdrawalContext = alcoholWithdrawal;
    const selfInjuryContext = selfInjuryRisk || recentSelfInjuryRisk;
    const coerciveDigitalMonitoringContext = coerciveDigitalMonitoring || recentCoerciveDigitalMonitoring;
    const urgentKind = harmToOthersContext
      ? 'harm_to_others'
      : imminentJumpLocationRisk
      ? 'imminent_jump_location'
      : alreadyIngestedOverdose
      ? 'ingested_overdose'
      : cardiacWarningSigns
      ? 'cardiac_warning'
      : eatingDisorderMedicalRisk
      ? 'eating_disorder_medical'
      : postpartumPsychosisRisk
      ? 'postpartum_psychosis'
      : followDeceasedRisk
      ? 'follow_deceased'
      : strangulationMedicalRisk
      ? 'strangulation_medical'
      : stalkingContext
      ? 'stalking'
      : minorSexualExploitationContext
      ? 'minor_sexual_exploitation'
      : childAbuseCurrentRisk
      ? 'child_abuse_current'
      : alcoholWithdrawalContext
      ? 'alcohol_withdrawal'
      : minorUnsafeContext
      ? 'minor_unsafe'
      : violenceContext
      ? 'violence'
      : coerciveDigitalMonitoringContext
      ? 'coercive_digital_monitoring'
      : selfInjuryContext
      ? 'self_injury'
      : crisis.signals.includes('psychosis_or_disorientation')
      ? 'psychosis'
      : 'self_harm';
    const urgentFollowUpSource = (harmToOthersFollowUpEscalation && !harmToOthersPlan)
      || (selfInjuryMeansAccessible && !selfInjuryRisk)
      || (recentCoerciveDigitalMonitoring && !coerciveDigitalMonitoring);
    const assistantMessage = harmToOthersContext
      ? harmToOthersPlan
        ? buildHarmToOthersSafetyMessage()
        : buildHarmToOthersFollowUpSafetyMessage()
      : imminentJumpLocationRisk
      ? buildImminentJumpLocationSafetyMessage()
      : alreadyIngestedOverdose
      ? buildIngestedOverdoseSafetyMessage()
      : cardiacWarningSigns
      ? buildCardiacWarningSafetyMessage()
      : eatingDisorderMedicalRisk
      ? buildEatingDisorderMedicalSafetyMessage()
      : postpartumPsychosisRisk
      ? buildPostpartumPsychosisSafetyMessage()
      : followDeceasedRisk
      ? buildFollowDeceasedSafetyMessage()
      : strangulationMedicalRisk
      ? buildStrangulationMedicalSafetyMessage()
      : stalkingContext
      ? buildStalkingSafetyMessage({ isFollowUp: recentStalkingDanger && !stalkingDanger })
      : minorSexualExploitationContext
      ? buildMinorSexualExploitationSafetyMessage({ isFollowUp: recentMinorSexualExploitation && !minorSexualExploitation })
      : childAbuseCurrentRisk
      ? buildChildAbuseCurrentSafetyMessage({ latestUserText })
      : alcoholWithdrawalContext
      ? buildAlcoholWithdrawalSafetyMessage()
      : minorUnsafeContext
      ? buildMinorUnsafeSafetyMessage({ isFollowUp: recentMinorUnsafe && !isMinorUnsafeText(latestUserText) })
      : violenceContext
      ? buildViolenceSafetyMessage({ latestUserText, isFollowUp: recentAcuteViolence && dialogueAct.type !== 'acute_violence' })
      : coerciveDigitalMonitoringContext
      ? buildCoerciveDigitalMonitoringSafetyMessage()
      : selfInjuryContext
      ? buildSelfInjurySafetyMessage({ isFollowUp: recentSelfInjuryRisk && !selfInjuryRisk })
      : crisis.signals.includes('self_harm_method')
      ? [
          '방법이나 수량은 알려줄 수 없어요.',
          '여기서 같이 안전을 먼저 확인할게요. 혼자 두지 않을게요.',
          '약이 곁에 있다면 손이 닿지 않는 곳으로 옮기고, 바로 109 또는 119에 연락하거나 가까운 사람에게 “지금 혼자 있으면 위험할 수 있어”라고 보내주세요.',
          '지금 답할 수 있으면 약이 손 닿는 곳에 있는지만 알려주세요.',
        ].join(' ')
      : crisis.signals.includes('psychosis_or_disorientation')
      ? [
          '그 느낌이 현실처럼 강하게 느껴진다면 매우 무섭고 혼란스러울 수 있습니다.',
          '여기서는 누가 실제로 조종한다고 단정하지 않고, 지금 안전하게 확인받을 수 있는 쪽으로 같이 옮기겠습니다.',
          '혼자 판단하려 애쓰기보다 믿을 수 있는 사람에게 지금 상태를 바로 알리고, 가능하면 정신건강 전문가나 응급 도움을 연결하세요.',
          '지금 위험하다고 느껴지거나 현실 구분이 더 어려워지면 119나 가까운 응급실 도움을 요청할 수 있습니다.',
        ].join(' ')
      : [
          '그 말을 그냥 상담 주제로 넘기지 않을게요.',
          '여기서 같이 안전을 먼저 확인할게요. 혼자 두지 않을게요.',
          '지금은 안전을 먼저 확보해야 합니다.',
          '혼자 있다면 가까운 사람에게 바로 연락하고, 한국에서는 자살예방상담전화 109 또는 응급상황 119에 도움을 요청할 수 있습니다.',
          '지금 답할 수 있으면 혼자 있는지, 위험한 물건이나 장소에서 떨어져 있는지만 먼저 알려주세요.',
        ].join(' ');

    return withCounselingReport({
      assistantMessage,
      assessment,
      safety: urgentSafetyNotice(urgentKind),
      actions: urgentSafetyActions(urgentKind),
      session: urgentSafetySession(urgentKind),
      evidence: evidenceBase,
      source: urgentFollowUpSource ? 'safety_followup' : 'safety',
    }, { messages, aihubRagContext: resolvedAihubRagContext });
  }

  if (recentPsychosis) {
    return withCounselingReport({
      assistantMessage: [
        '아무도 믿기 어렵게 느껴지는 상태 자체가 꽤 무섭고 고립되게 만들 수 있습니다.',
        '그 느낌을 사실로 단정하기보다, 지금은 혼자서 판단하지 않도록 안전한 확인 통로를 하나 만드는 게 먼저입니다.',
        '가장 덜 위협적으로 느껴지는 사람이나 장소가 있다면 그쪽으로 연결하고, 어렵다면 정신건강 전문가나 응급 도움을 통해 확인받는 쪽이 안전합니다.',
        '현실 구분이 더 흔들리거나 스스로를 지키기 어렵다고 느껴지면 119나 가까운 응급실 도움을 요청할 수 있습니다.',
      ].join(' '),
      assessment,
      safety,
      actions: [
        '혼자서 결론 내리려 하지 말고 가장 덜 위협적으로 느껴지는 사람 한 명을 정합니다.',
        '지금 상태를 짧게 알릴 문장을 준비합니다.',
        '현실 구분이 더 어려워지면 119나 응급실 같은 즉시 도움 경로를 사용합니다.',
      ],
      session: {
        title: '현실검증 어려움 안전 확인',
        focus: 'psychosis_or_disorientation',
        steps: ['혼자 판단하지 않기', '덜 위협적인 연결 찾기', '전문 도움 경로 열어두기'],
      },
      evidence: evidenceBase,
      source: 'safety_followup',
    }, { messages, aihubRagContext: resolvedAihubRagContext });
  }

  if (recentAlcoholWithdrawal) {
    return withCounselingReport({
      assistantMessage: [
        '병원에 가기 싫다는 마음도 이해됩니다.',
        '그래도 손 떨림과 헛것이 보이는 상태가 술 금단과 연결되어 있다면 혼자 버티는 건 위험할 수 있습니다.',
        '지금은 의지 문제가 아니라 의료적으로 확인받아야 할 수 있는 상황입니다.',
        '119에 전화하거나 가까운 응급실, 또는 믿을 수 있는 사람에게 “술을 끊으려는데 손이 떨리고 헛것이 보여서 혼자 있으면 위험할 수 있어”라고 알려주세요.',
      ].join(' '),
      assessment,
      safety,
      actions: [
        '혼자 금단 증상을 견디지 않습니다.',
        '119, 응급실, 가까운 의료기관 중 하나를 연결합니다.',
        '이동이 어렵다면 가까운 사람에게 현재 증상과 위치를 알립니다.',
      ],
      session: {
        title: '금단 의심 후속 안전 확인',
        focus: 'alcohol_withdrawal',
        steps: ['혼자 버티지 않기', '의료 도움 연결하기', '증상과 위치 알리기'],
      },
      evidence: evidenceBase,
      source: 'safety_followup',
    }, { messages, aihubRagContext: resolvedAihubRagContext });
  }

  if (recentHarmToOthersPlan) {
    return withCounselingReport({
      assistantMessage: buildHarmToOthersFollowUpSafetyMessage(),
      assessment,
      safety,
      actions: [
        '상대 주소나 이동 경로를 확인하지 않습니다.',
        '칼이나 위험한 물건과 몸의 거리를 둡니다.',
        '가까운 사람, 112, 119 중 하나와 연결합니다.',
      ],
      session: {
        title: '타해 위험 후속 안전 확인',
        focus: 'harm_to_others',
        steps: ['찾아가지 않기', '위험 물건과 거리 두기', '즉시 도움 연결하기'],
      },
      evidence: evidenceBase,
      source: 'safety_followup',
    }, { messages, aihubRagContext: resolvedAihubRagContext });
  }

  if (recentSelfInjuryRisk) {
    return withCounselingReport({
      assistantMessage: buildSelfInjurySafetyMessage({ isFollowUp: true }),
      assessment,
      safety: urgentSafetyNotice('self_injury'),
      actions: urgentSafetyActions('self_injury'),
      session: urgentSafetySession('self_injury'),
      evidence: evidenceBase,
      source: 'safety_followup',
    }, { messages, aihubRagContext: resolvedAihubRagContext });
  }

  if (recentCrisis) {
    return withCounselingReport({
      assistantMessage:
        '조금 나아졌다는 말은 중요한 변화예요. 그래도 방금 위험한 마음을 말해줬기 때문에 지금은 일반 상담으로 바로 넘기지 않고 안전 확인을 먼저 할게요. 지금 혼자 있나요? 위험한 물건이나 약에서 떨어져 있고, 바로 연락할 수 있는 사람이 한 명이라도 있나요?',
      assessment,
      safety,
      actions: [
        '지금 혼자라면 가까운 사람에게 짧게라도 연락하세요.',
        '수면제, 칼, 끈처럼 위험할 수 있는 물건에서 거리를 두세요.',
        '기분이 나아져도 오늘은 109, 119, 가까운 응급실 같은 즉시 도움 경로를 열어두세요.',
      ],
      session: {
        title: '위기 이후 안전 확인',
        focus: 'recent_crisis_context',
        steps: ['혼자 있는지 확인하기', '위험 물건과 거리 두기', '연락 가능한 사람 한 명 정하기'],
      },
      evidence: evidenceBase,
      source: 'safety_followup',
    }, { messages, aihubRagContext: resolvedAihubRagContext });
  }

  const llmRagContext = allowPrivateRagInLlmPrompt ? resolvedAihubRagContext : publicRagEvidence(resolvedAihubRagContext);
  const llmResult = llmClient
    ? await llmClient(
        buildLlmPrompt({
          messages,
          mode,
          assessment,
          aihubContext,
          aihubRagContext: llmRagContext,
          counselorStyleProfile,
          openai,
          dialogueAct,
        }),
      )
    : null;

  const base = llmResult ?? buildDemoTurn({
    messages,
    latestUserText,
    mode,
    assessment,
    safety,
    sessionProfile,
    dialogueAct,
    recentDigitalSexualExtortion,
    recentSexualAssault,
    recentEatingDisorderHarm,
    recentManicActivation,
    postpartumIntrusiveHarmThought,
  });

  return withCounselingReport({
    assistantMessage: sanitizeAssistantMessage(base.assistantMessage, {
      limitQuestions: safety.priority === 'self_care',
    }),
    assessment,
    safety,
    actions: sanitizeActions(base.actions),
    session: normalizeSession(base.session, mode),
    evidence: {
      ...evidenceBase,
      userSignals: summarizeUserSignals(conditions, severity),
    },
    source: llmResult ? 'llm' : 'demo',
  }, { messages, aihubRagContext: resolvedAihubRagContext });
}

function buildModelGuidance(trainingVideoNotes) {
  const summary = summarizeTrainingVideoNotes(trainingVideoNotes);
  return [
    `참고 영상: ${summary.url}`,
    `분류 모델: KLUE-BERT 기반 우울/중독/불안 0/1 예측.`,
    `요약 모델: KoAlpaca 기반 상담 보고서 생성.`,
    `라벨 기준: ${summary.labels.join(', ')} ${summary.labelScale}점 척도.`,
  ].join('\n');
}

function buildResponseStyleGuidance(aihubRagContext, counselorStyleProfile) {
  const learnedStyle = counselorStyleProfile?.available
    ? [
        counselorStyleProfile.rogerianSummary
          ? `실제 상담사 발화 학습 요약: ${counselorStyleProfile.rogerianSummary}`
          : '실제 상담사 발화 학습 요약: 공감적 이해와 명료화/반영을 우선 참고한다.',
        counselorStyleProfile.primaryCounselorMoves?.length
          ? `실제 상담사 개입 빈도 상위: ${counselorStyleProfile.primaryCounselorMoves
              .slice(0, 4)
              .map((move) => move.korean ?? move.label)
              .join(', ')}.`
          : null,
      ].filter(Boolean)
    : [];

  return [
    '대화 방식: 칼 로저스의 인간중심(person-centered) 상담 원칙을 우선 적용한다.',
    ...learnedStyle,
    '첫 문장은 분석이나 진단이 아니라 사용자가 말한 정서와 의미를 공감적으로 반영한다.',
    '공감적 이해, 무조건적 긍정적 존중/비판단, 진솔성을 유지한다.',
    '사용자가 시나리오에서 벗어나거나 짧게 답해도 바로 교정하지 말고, 이전 맥락과 이어지는 의미를 확인한다.',
    '한 번에 하나의 열린 질문만 사용하고, 질문은 사용자의 직전 표현 안에 있는 감정·기억·몸의 반응을 따라간다.',
    '진단명과 강도는 충분한 맥락이 쌓인 뒤 가능성/가설로만 말하며, 확정 진단처럼 말하지 않는다.',
    'RAG 검색 근거는 내부 참고 자료다. 원문, 개인정보, 파일명, 사례 ID, 라벨명 자체를 사용자에게 노출하지 말고 상담 문장으로 자연스럽게 반영한다.',
    aihubRagContext?.available
      ? '현재 AIHub RAG 검색 근거가 있으므로 유사 사례의 라벨과 상담사 개입을 참고하되, 사용자의 현재 말보다 앞서가지 않는다.'
      : '현재 AIHub RAG 검색 근거가 약하거나 없으면 기존 안전 규칙과 대화 맥락만으로 응답한다.',
  ].join('\n');
}

function shouldSkipRagForSafety({
  severity,
  recentPsychosis,
  recentAlcoholWithdrawal,
  recentHarmToOthersPlan,
  recentSelfInjuryRisk,
  recentCrisis,
}) {
  return Boolean(
    severity?.level === 'urgent' ||
      recentPsychosis ||
      recentAlcoholWithdrawal ||
      recentHarmToOthersPlan ||
      recentSelfInjuryRisk ||
      recentCrisis,
  );
}

function skippedRagContext(reason) {
  return {
    available: false,
    skipped: true,
    skipReason: reason,
    privacyMode: 'summary_only',
    queryFeatures: [],
    matches: [],
    contextText: 'AIHub RAG 검색은 안전 우선 분기에서 생략되었습니다.',
  };
}

async function safeRagProvider(provider, messages) {
  try {
    return await provider(messages);
  } catch {
    return {
      available: false,
      error: 'rag_provider_failed',
      privacyMode: 'summary_only',
      queryFeatures: [],
      matches: [],
      contextText: 'AIHub RAG 검색 근거를 현재 사용할 수 없습니다. 기존 상담 지식과 안전 규칙으로 응답합니다.',
    };
  }
}

function withCounselingReport(turn, { messages, aihubRagContext }) {
  return {
    ...turn,
    report: buildCounselingSummaryReport({
      messages,
      assessment: turn.assessment,
      safety: turn.safety,
      actions: turn.actions,
      session: turn.session,
      aihubRagContext,
    }),
  };
}

function buildCounselingSummaryReport({ messages = [], assessment, safety, actions = [], session, aihubRagContext }) {
  const profile = assessment?.sessionProfile;
  const ragSupport = assessment?.aihubRag ?? summarizeRagAssessment(aihubRagContext);
  const currentHypothesis = profile?.primaryHypothesis ?? { key: 'general', label: '일반 스트레스', confidence: 'tentative', score: 0 };
  const intensity = {
    level: assessment?.severity?.level ?? 'low',
    score: assessment?.severity?.score ?? 0,
    reasons: assessment?.severity?.reasons ?? [],
  };
  const shouldDeferHypothesis = safety?.priority === 'emergency' || intensity.level === 'urgent';
  const display = {
    currentHypothesisText: shouldDeferHypothesis
      ? '안전 우선: 상태 가설 보류'
      : `${currentHypothesis.label} 가능성 (${confidenceLabel(currentHypothesis.confidence)})`,
    intensityText: `지원 강도 ${levelLabel(intensity.level)}`,
  };
  const resourceSummary = buildResourceSummary(profile?.signals);
  const ragSupportSummary = {
    available: Boolean(ragSupport?.available),
    skipped: Boolean(ragSupport?.skipped),
    skipReason: ragSupport?.skipReason ?? null,
    matchCount: ragSupport?.matchCount ?? 0,
    matchedConditions: ragSupport?.matchedConditions ?? [],
    matchedConditionText: formatMatchedConditionText(ragSupport?.matchedConditions ?? []),
    topClientLabels: ragSupport?.topClientLabels ?? [],
    privacyMode: aihubRagContext?.privacyMode ?? 'summary_only',
  };
  const recommendedNextSteps = actions.slice(0, 3);
  return {
    title: '상담 요약 보고서',
    userTurnCount: messages.filter((message) => message.role === 'user').length,
    phase: profile?.phase ?? 'unknown',
    presentingConcerns: profile?.signals?.symptoms ?? [],
    currentHypothesis,
    intensity,
    display,
    resourceSummary,
    userSummary: buildUserReportSummary({ display, intensity, safety, recommendedNextSteps, resourceSummary }),
    counselorReview: buildCounselorReviewSummary({
      phase: profile?.phase ?? 'unknown',
      display,
      safety,
      resourceSummary,
      ragSupport: ragSupportSummary,
      aihubLabels: profile?.aihubLabels ?? null,
      recommendedNextSteps,
      boundary: assessment?.clinicalBoundary ?? '확정 진단이 아닌 대화 기반 가능성 및 위험도 추정입니다.',
    }),
    aihubLabelScores: profile?.aihubLabels ?? null,
    ragSupport: ragSupportSummary,
    safety: {
      priority: safety?.priority ?? 'self_care',
      title: safety?.title ?? '',
    },
    recommendedNextSteps,
    sessionFocus: session?.focus ?? 'general',
    boundary: assessment?.clinicalBoundary ?? '확정 진단이 아닌 대화 기반 가능성 및 위험도 추정입니다.',
  };
}

function buildUserReportSummary({ display, intensity, safety, recommendedNextSteps = [], resourceSummary }) {
  const safetyPriority = safety?.priority ?? 'self_care';
  const needsImmediateSafety = safetyPriority === 'emergency' || intensity.level === 'urgent';
  const text = needsImmediateSafety
    ? `지금은 상태 이름을 붙이기보다 안전 확보가 우선입니다. ${display.intensityText}으로 정리됩니다.`
    : `현재까지는 ${display.currentHypothesisText}을 조심스럽게 보고 있고, ${display.intensityText}으로 정리됩니다.`;
  const firstStep = recommendedNextSteps[0] ?? '지금 가장 부담이 덜한 한 가지를 함께 정리합니다.';

  return {
    audience: 'user',
    text,
    resourceText: resourceSummary?.userText ?? '아직 확인된 도움 신호는 충분하지 않습니다.',
    nextStepText: `다음에는 ${firstStep}`,
    boundary: '이 요약은 대화를 돕기 위한 임시 정리이며, 전문가의 평가를 대신하지 않습니다.',
  };
}

function buildCounselorReviewSummary({
  phase,
  display,
  safety,
  resourceSummary,
  ragSupport,
  aihubLabels,
  recommendedNextSteps = [],
  boundary,
}) {
  return {
    audience: 'counselor_review',
    phase,
    primaryHypothesis: display.currentHypothesisText,
    supportIntensity: display.intensityText,
    safetyPriority: safety?.priority ?? 'self_care',
    safetyTitle: safety?.title ?? '',
    protectiveFactorSummary: resourceSummary?.counselorText ?? '보호/개선 요인: 아직 확인 부족',
    ragSupportText: ragSupport.matchedConditionText,
    aihubLabelSummary: formatAihubLabelSummary(aihubLabels),
    nextSteps: recommendedNextSteps,
    boundary,
  };
}

function buildResourceSummary(signals = {}) {
  const protectiveFactors = (signals?.protectiveFactors ?? []).map(protectiveFactorLabel);
  const improvementFactors = (signals?.improvementFactors ?? []).map(improvementFactorLabel);
  const visibleFactors = uniqueReasons([...protectiveFactors, ...improvementFactors]);

  if (!visibleFactors.length) {
    return {
      protectiveFactors,
      improvementFactors,
      userText: '아직 확인된 도움 신호는 충분하지 않습니다.',
      counselorText: '보호/개선 요인: 아직 확인 부족',
    };
  }

  return {
    protectiveFactors,
    improvementFactors,
    userText: `확인된 도움 신호는 ${visibleFactors.join(', ')}입니다. 이 신호는 회복 자원으로 참고하되 현재 강도 판단을 대신하지 않습니다.`,
    counselorText: `보호/개선 요인: ${visibleFactors.join(', ')}`,
  };
}

function protectiveFactorLabel(factor) {
  return {
    social_support: '사회적 지지',
    professional_support: '전문가 연결',
  }[factor] ?? '도움 자원';
}

function improvementFactorLabel(factor) {
  return {
    relief_after_talking: '대화 후 완화',
    connection: '연결',
  }[factor] ?? '완화 신호';
}

function formatAihubLabelSummary(aihubLabels) {
  if (!aihubLabels) return 'AIHub 라벨 점수 없음';
  return [
    `주요 증상 ${aihubLabels.majorSymptoms?.score ?? 0}`,
    `위험 요인 ${aihubLabels.riskFactors?.score ?? 0}`,
    `개선 요인 ${aihubLabels.improvementFactors?.score ?? 0}`,
    `개입 요인 ${aihubLabels.interventionFactors?.score ?? 0}`,
  ].join(', ');
}

function confidenceLabel(confidence) {
  return {
    tentative: '초기 가설',
    moderate: '누적 근거 있음',
    strong: '강한 누적 근거',
  }[confidence] ?? '추정 중';
}

function levelLabel(level) {
  return {
    low: '낮음',
    medium: '중간',
    high: '높음',
    urgent: '긴급',
  }[level] ?? '추정 중';
}

function publicRagEvidence(aihubRagContext) {
  if (aihubRagContext?.skipped) {
    return {
      available: false,
      skipped: true,
      skipReason: aihubRagContext.skipReason ?? 'safety_first',
      privacyMode: aihubRagContext.privacyMode ?? 'summary_only',
      queryFeatures: [],
      matchCount: 0,
      matchedConditions: [],
      contextText: 'AIHub RAG 보조 근거: 안전 우선 분기에서는 RAG 검색과 사례 근거 표시를 생략합니다.',
    };
  }

  const matches = aihubRagContext?.matches ?? [];
  const matchedConditions = publicMatchedConditions(aihubRagContext);
  const conditionText = formatMatchedConditionText(matchedConditions);

  return {
    available: Boolean(aihubRagContext?.available),
    error: aihubRagContext?.error ?? null,
    privacyMode: aihubRagContext?.privacyMode ?? 'summary_only',
    queryFeatures: aihubRagContext?.queryFeatures ?? [],
    matchCount: matches.length,
    matchedConditions,
    contextText: aihubRagContext?.error
      ? 'AIHub RAG 보조 근거: 현재 사용할 수 없습니다. 기존 상담 지식과 안전 규칙으로 응답합니다.'
      : aihubRagContext?.available
        ? `AIHub RAG 보조 근거: 유사 요약 사례 ${matches.length}건, 조건 ${conditionText}. 원문, 사례 요약, 개인정보, 파일명은 UI 근거에 노출하지 않습니다.`
        : 'AIHub RAG 보조 근거: 일치 요약 사례 없음. 원문, 사례 요약, 개인정보, 파일명은 UI 근거에 노출하지 않습니다.',
  };
}

function toDisplayConditionCount([condition, count]) {
  return {
    condition,
    label: ragConditionLabel(condition),
    count,
  };
}

function publicMatchedConditions(aihubRagContext) {
  const matches = aihubRagContext?.matches ?? [];
  if (isGriefRagContext(aihubRagContext)) {
    return [
      {
        condition: 'GRIEF',
        label: ragConditionLabel('GRIEF'),
        count: matches.length,
      },
    ];
  }
  if (isTraumaRagContext(aihubRagContext)) {
    return [
      {
        condition: 'TRAUMA',
        label: ragConditionLabel('TRAUMA'),
        count: matches.length,
      },
    ];
  }

  return Object.entries(
    matches.reduce((counts, match) => {
      counts[match.condition] = (counts[match.condition] ?? 0) + 1;
      return counts;
    }, {}),
  )
    .sort(([aCondition, aCount], [bCondition, bCount]) => bCount - aCount || aCondition.localeCompare(bCondition))
    .map(toDisplayConditionCount);
}

function isGriefRagContext(aihubRagContext) {
  const features = aihubRagContext?.queryFeatures ?? [];
  return features.includes('grief') && !features.includes('self_harm');
}

function isTraumaRagContext(aihubRagContext) {
  const features = aihubRagContext?.queryFeatures ?? [];
  return features.includes('trauma') && !features.includes('self_harm');
}

function formatMatchedConditionText(matchedConditions = []) {
  const text = matchedConditions
    .map((item) => `${item.label ?? ragConditionLabel(item.condition)} ${item.count}건`)
    .join(', ');
  return text || '없음';
}

function ragConditionLabel(condition) {
  return {
    GRIEF: '상실/애도 관련',
    TRAUMA: '트라우마 반응 관련',
    ANXIETY: '불안 관련',
    DEPRESSION: '우울 관련',
    ADDICTION: '중독/충동 관련',
    NORMAL: '일반 스트레스 관련',
    UNKNOWN: '기타 관련',
  }[condition] ?? '기타 관련';
}

function buildDemoTurn({
  messages,
  latestUserText,
  mode,
  assessment,
  safety,
  sessionProfile,
  dialogueAct,
  recentDigitalSexualExtortion = false,
  recentSexualAssault = false,
  recentEatingDisorderHarm = false,
  recentManicActivation = false,
  postpartumIntrusiveHarmThought = false,
}) {
  const strongest = strongestCondition(assessment.conditions);
  const label = modeLabels[mode] ?? modeLabels.free;
  const isFollowUp = messages.filter((message) => message.role === 'user').length > 1;
  const soundsImproved = /나아졌|괜찮아졌|좋아졌|편해졌|덜\s*힘들/i.test(latestUserText);
  const primary = sessionProfile.primaryHypothesis;

  if (isBereavementBySuicide(latestUserText)) {
    return {
      assistantMessage:
        '친구가 그렇게 세상을 떠났다는 소식을 들은 순간이 아직 마음에 남아 있는 것 같아요. 단순히 슬프다는 말로는 부족하고, 충격이나 허망함, 멍함이 한꺼번에 왔을 수도 있겠습니다. 지금은 분석보다 그 무게를 먼저 같이 보겠습니다. 그 소식을 처음 들었을 때 제일 먼저 든 감정은 뭐였나요?',
      actions: [
        '그 소식을 들었던 순간의 감정을 한 단어로만 적어보세요.',
        '오늘은 그 이야기를 혼자 오래 붙잡고 있지 않도록 믿을 수 있는 사람 한 명을 정하세요.',
        '잠이나 식사가 무너질 정도로 이어지면 애도 상담이나 정신건강 전문가 도움을 고려하세요.',
      ],
      session: {
        title: '상실과 애도 반영',
        focus: 'grief',
        steps: ['소식을 들은 순간 떠올리기', '첫 감정에 이름 붙이기', '혼자 견디지 않을 연결 정하기'],
      },
    };
  }

  if (isAiPositiveConnectionText(latestUserText) && !isAiDependencyText(latestUserText) && !isAiRomanticAttachmentText(latestUserText)) {
    return buildAiPositiveConnectionTurn({ mode });
  }

  if (isFollowUp && soundsImproved) {
    return {
      assistantMessage:
        '조금 나아진 느낌이 생겼다면 그 변화 자체가 중요한 단서입니다. 지금은 바로 새 질문으로 밀어붙이기보다, 무엇이 도움이 됐는지 짧게 붙잡아 볼게요. 방금 대화에서 마음이 덜 무거워진 지점이 공감받는 느낌이었나요, 정리되는 느낌이었나요, 아니면 혼자가 아니라는 느낌이었나요?',
      actions: [
        '방금 조금 나아진 이유를 한 단어로 적어보세요.',
        '그 느낌이 10분만 더 유지되도록 물 마시기, 조명 낮추기, 몸 기대기 중 하나를 해보세요.',
        '다시 위험한 생각이 올라오면 혼자 버티지 말고 109 또는 119 같은 즉시 도움 경로를 사용하세요.',
      ],
      session: {
        title: '나아진 감각 붙잡기',
        focus: strongest.key,
        steps: ['무엇이 도움이 됐는지 고르기', '몸의 긴장 변화 확인하기', '다음 10분 동안 할 행동 정하기'],
      },
    };
  }

  if (isAddictionUrgeText(latestUserText, messages)) {
    return buildAddictionUrgeTurn({ latestUserText, mode });
  }

  if (isEatingDisorderHarmText(latestUserText) || (recentEatingDisorderHarm && /먹으면\s*안|먹기\s*싫|살|뚱뚱|몸|토하|굶/i.test(latestUserText))) {
    return buildEatingDisorderHarmTurn({ latestUserText, mode, isFollowUp: recentEatingDisorderHarm });
  }

  if (isDigitalSexualExtortionText(latestUserText) || (recentDigitalSexualExtortion && /지우|삭제|무서|협박|사진|대화/i.test(latestUserText))) {
    return buildDigitalSexualExtortionTurn({ latestUserText, mode, isFollowUp: recentDigitalSexualExtortion });
  }

  if (isAiRomanticAttachmentText(latestUserText)) {
    return buildAiRomanticAttachmentTurn({ mode });
  }

  if (isAiDependencyText(latestUserText)) {
    return buildAiDependencyTurn({ latestUserText, mode });
  }

  if ((recentSexualAssault || sessionProfile.signals.symptoms.includes('trauma')) && isTraumaSelfStigmaText(latestUserText)) {
    return buildTraumaSelfStigmaTurn({ latestUserText, mode });
  }

  if (recentSexualAssault && /내가\s*잘못|내\s*잘못|죄책감|미안/i.test(latestUserText)) {
    return buildSexualAssaultGuiltTurn({ mode });
  }

  if (isSexualAssaultDisclosureText(latestUserText)) {
    return buildSexualAssaultDisclosureTurn({ latestUserText, mode });
  }

  if (isManicActivationText(latestUserText) || (recentManicActivation && isManicActivationFollowUpText(latestUserText))) {
    return buildManicActivationTurn({ latestUserText, mode, isFollowUp: recentManicActivation });
  }

  if (postpartumIntrusiveHarmThought) {
    return buildPostpartumIntrusiveHarmThoughtTurn({ latestUserText, mode });
  }

  if (isDissociationGroundingText(latestUserText)) {
    return buildDissociationGroundingTurn({ latestUserText, mode });
  }

  if (dialogueAct?.type === 'correction') {
    return buildCorrectionContinuation({ latestUserText, dialogueAct, sessionProfile, mode });
  }

  if (dialogueAct?.type === 'ai_mistrust') {
    return buildAiMistrustTurn({ latestUserText, sessionProfile, mode });
  }

  if (dialogueAct?.type === 'boundary_refusal') {
    return buildBoundaryRefusalTurn({ latestUserText, messages, sessionProfile, mode });
  }

  if (dialogueAct?.type === 'meta_clarification') {
    return buildMetaClarificationTurn({ latestUserText, dialogueAct, messages, sessionProfile, mode });
  }

  if (dialogueAct?.type === 'status_question') {
    return buildStatusQuestionTurn({ latestUserText, messages, sessionProfile, assessment, mode });
  }

  if (dialogueAct?.type === 'passive_death_wish') {
    return buildPassiveDeathWishTurn({ latestUserText, sessionProfile, mode });
  }

  if (dialogueAct?.type === 'avoidance_or_uncertainty') {
    return buildUncertaintyContinuation({ latestUserText, dialogueAct, sessionProfile, mode });
  }

  if (dialogueAct?.type === 'answer_to_pending_question') {
    return buildPendingAnswerContinuation({ latestUserText, dialogueAct, sessionProfile, mode });
  }

  if (dialogueAct?.type === 'deepening_disclosure') {
    return buildDeepeningDisclosureTurn({ latestUserText, sessionProfile, mode });
  }

  if (isPanicSomaticText(latestUserText)) {
    return buildPanicSomaticTurn({ latestUserText, mode });
  }

  if (isAddictionShameText(latestUserText)) {
    return buildAddictionShameTurn({ latestUserText, mode });
  }

  const severityText = {
    low: '아직 단정하기보다 조금 더 들어보는 단계로 두겠습니다.',
    medium: '이야기가 조금 더 쌓이면 어떤 패턴인지 조심스럽게 정리해 볼 수 있겠습니다.',
    high: '일상에 미치는 영향도 함께 확인하면서 필요하면 전문가 도움까지 열어두겠습니다.',
    urgent: safety.message,
  }[assessment.severity.level];

  if (sessionProfile.phase === 'opening') {
    return {
      assistantMessage: openingRogerianMessage(latestUserText),
      actions: rogerianActions(sessionProfile),
      session: rogerianSession(sessionProfile, mode),
    };
  }

  if (sessionProfile.phase === 'integrating') {
    return {
      assistantMessage: [
        `지금까지 말해준 내용을 조심스럽게 종합하면, 확정 진단은 아니지만 ${primary.label} 가능성을 우선 가설로 볼 수 있습니다.`,
        cumulativeEvidenceSentence(sessionProfile),
        '다만 이건 이름표를 붙이려는 게 아니라, 당신이 겪는 경험을 더 정확히 이해하기 위한 임시 정리입니다.',
        nextRogerianQuestion(sessionProfile),
      ].join(' '),
      actions: rogerianActions(sessionProfile),
      session: rogerianSession(sessionProfile, mode),
    };
  }

  return {
    assistantMessage: [
      `말해줘서 고마워요. 그렇게 ${latestUserText.includes('잠') ? '잠을 못 자고 ' : ''}힘든 상태가 이어지면 몸도 마음도 많이 지칠 수 있습니다.`,
      `지금은 ${strongest.name}라는 이름을 붙이기보다, 당신이 실제로 겪는 느낌을 먼저 따라가 보고 싶어요.`,
      severityText,
      `${label} 모드에서는 내가 먼저 결론을 내리기보다, 당신 말 안에 있는 감정과 의미를 확인하면서 가겠습니다.`,
      latestUserText.includes('잠')
        ? '잠들려고 누웠을 때 제일 크게 올라오는 건 걱정인가요, 몸의 긴장인가요, 아니면 이유 없이 밀려오는 불안인가요?'
        : '지금 그 이야기를 떠올리면 제일 먼저 몸이나 마음에서 느껴지는 반응은 무엇인가요?',
    ].join(' '),
    actions: recommendedActions(assessment.severity.level, strongest.key),
    session: sessionForMode(mode, strongest.key),
  };
}

function buildPendingAnswerContinuation({ latestUserText, dialogueAct, sessionProfile, mode }) {
  const answer = spokenAnswer(latestUserText);
  const naturalAnswer = naturalShortAnswer(answer);
  const pending = dialogueAct.pendingQuestion;

  if (isDurationOrFunctionalImpactText(latestUserText)) {
    return {
      assistantMessage: [
        `“${answer}”라는 말은 짧은 답이 아니라 중요한 생활 신호로 들립니다.`,
        '몇 주째 이어지고 학교나 일상에 영향을 줄 정도라면 혼자 버티기에는 부담이 커졌을 수 있어요.',
        '지금은 감정 이름을 억지로 찾기보다, 오래 이어진 기간과 일상 영향 자체를 같이 보겠습니다.',
        '오늘 하루에서 가장 먼저 줄여야 할 부담은 등교, 잠, 식사, 사람 만나는 일 중 어디에 가깝나요?',
      ].join(' '),
      actions: [
        '지속 기간과 학교/출근 영향은 중요한 기능 손상 신호로 기록합니다.',
        '오늘 하루 부담을 하나만 줄이는 방향을 정합니다.',
        '몇 주 이상 지속되면 가까운 사람이나 전문가에게 현재 상태를 알리는 것을 검토합니다.',
      ],
      session: {
        title: modeLabels[mode] ?? '지속 기간과 일상 영향 확인',
        focus: 'duration_functional_impact',
        steps: ['지속 기간 확인하기', '일상 영향 인정하기', '부담 하나 줄이기'],
      },
    };
  }

  if (pending?.target === 'sleep_trigger') {
    return {
      assistantMessage: [
        `${quotedWithJosa(naturalAnswer, '이라고', '라고')} 답해준 게 중요하게 들립니다.`,
        '밤에 누웠을 때 단순한 걱정보다 어떤 기억이 먼저 떠오르고, 그 기억이 몸을 다시 깨우는 느낌일 수 있겠어요.',
        '지금은 그 기억을 억지로 자세히 파고들기보다, 안전한 만큼만 붙잡아 보겠습니다.',
        '그 기억은 특정 장면에 가깝나요, 아니면 어떤 사람이나 말에 더 가깝나요?',
      ].join(' '),
      actions: rogerianActions(sessionProfile),
      session: rogerianSession({ ...sessionProfile, primaryHypothesis: { key: 'memory', label: '기억 단서' } }, mode),
    };
  }

  if (pending?.target === 'grief_initial_reaction') {
    return {
      assistantMessage: [
        `“${answer}”라고 느껴졌던 거군요.`,
        '친구의 소식을 들은 순간 현실감이 잠깐 무너진 것처럼 느껴졌을 수 있겠습니다.',
        '그건 이상한 반응이라기보다 너무 큰 일을 마음이 한 번에 받아들이기 어려울 때 생길 수 있는 멍함에 가깝습니다.',
        '그 비현실적인 느낌은 소식을 들은 장면에서 강했나요, 아니면 시간이 지나고 혼자 있을 때 더 크게 왔나요?',
      ].join(' '),
      actions: [
        '비현실감이나 멍함을 이상하다고 판단하지 않고 그대로 적어봅니다.',
        '그 느낌이 강해지는 상황이 사람, 장소, 시간 중 어디와 가까운지 확인합니다.',
        '상실 이야기를 오래 혼자 붙잡고 있지 않도록 믿을 수 있는 사람 한 명을 정합니다.',
      ],
      session: {
        title: modeLabels[mode] ?? '상실과 애도 반영',
        focus: 'grief',
        steps: ['비현실감 반영하기', '강해지는 맥락 확인하기', '혼자 견디지 않을 연결 정하기'],
      },
    };
  }

  if (pending?.target === 'memory_context') {
    return {
      assistantMessage: [
        `${quotedWithJosa(naturalAnswer, '이', '가')} 먼저 떠오르는군요.`,
        '그 기억이 특정 장면보다 한 사람이나 관계 쪽에 더 가까운 것처럼 들립니다.',
        '지금은 그 사람을 원인으로 확정하기보다, 그 이름이 떠오를 때 마음이 어떻게 움직이는지부터 천천히 보겠습니다.',
        `${naturalAnswer}라는 말을 떠올릴 때 제일 가까운 감정은 그리움, 긴장, 화, 무서움 중 어디에 가깝나요?`,
      ].join(' '),
      actions: rogerianActions(sessionProfile),
      session: rogerianSession({ ...sessionProfile, primaryHypothesis: { key: 'relationship_memory', label: '관계 기억' } }, mode),
    };
  }

  if (pending?.target === 'support') {
    return {
      assistantMessage: [
        `“${answer}”라고 말해준 게 중요합니다.`,
        '지금 완전히 혼자가 아니고 동생에게 연락할 수 있다면, 위험을 낮추는 실제 연결이 하나 있는 거예요.',
        '이제 그 연결을 머릿속 가능성으로만 두지 말고 바로 쓸 수 있게 짧게 정리해 보겠습니다.',
        '동생에게 지금 보낼 수 있는 문장을 한 줄로 만든다면 “나 오늘 혼자 있으면 좀 위험할 수 있어서 잠깐 연락하고 싶어”처럼 보낼 수 있을까요?',
      ].join(' '),
      actions: [
        '동생에게 바로 보낼 짧은 문장을 정합니다.',
        '오늘 밤 혼자 버티는 시간을 줄이도록 통화, 메시지, 같은 공간 중 가능한 방식을 고릅니다.',
        '사라지고 싶은 생각이 강해지면 동생과 109 또는 119 같은 즉시 도움 경로를 함께 사용합니다.',
      ],
      session: {
        title: modeLabels[mode] ?? '안전 연결',
        focus: 'support_contact',
        steps: ['연락 가능한 사람 확인하기', '보낼 문장 만들기', '오늘 밤 혼자 있는 시간 줄이기'],
      },
    };
  }

  if (pending?.target === 'emotion_choice') {
    const emotionAnswer = normalizeEmotionChoiceAnswer(answer, pending);

    return {
      assistantMessage: [
        `“${emotionAnswer}” 쪽에 더 가까운 거군요.`,
        '그 감정이 먼저 떠오른다는 건 지금 마음이 그 부분을 그냥 넘기기 어렵다는 뜻일 수 있습니다.',
        '바로 해석하지 않고 그 감정의 결을 따라가 보겠습니다.',
        '그 감정은 몸에서 먼저 느껴지나요, 아니면 어떤 생각 문장으로 먼저 떠오르나요?',
      ].join(' '),
      actions: rogerianActions(sessionProfile),
      session: rogerianSession(sessionProfile, mode),
    };
  }

  return {
    assistantMessage: [
      `${answer}라는 말이 먼저 나왔군요.`,
      '짧은 답이라도 그 안에 지금 가장 가까운 단서가 들어 있을 수 있습니다.',
      pending?.text ? '방금 내가 물은 것에 맞춰 답해준 걸로 받아들이고, 그 단어에서 다시 시작하겠습니다.' : '지금은 그 단어에서 다시 시작하겠습니다.',
      '그 말을 떠올릴 때 마음이 더 무거워지나요, 몸이 긴장하나요, 아니면 잠깐 멍해지나요?',
    ].join(' '),
    actions: rogerianActions(sessionProfile),
    session: rogerianSession(sessionProfile, mode),
  };
}

function buildPassiveDeathWishTurn({ latestUserText, sessionProfile, mode }) {
  const answer = spokenAnswer(latestUserText);

  return {
    assistantMessage: [
      `“${answer}”라는 말은 가볍게 넘기지 않겠습니다.`,
      '죽겠다는 뜻은 아니라고 했지만, 사라지고 싶다는 생각이 자꾸 든다면 마음이 꽤 지쳐 있다는 신호일 수 있어요.',
      '여기서는 원인을 캐묻기보다 안전과 부담을 먼저 같이 확인하겠습니다.',
      '지금 혼자 있나요, 아니면 바로 곁에 있거나 연락할 수 있는 사람이 있나요?',
    ].join(' '),
    actions: [
      '지금 혼자라면 연락 가능한 사람 한 명을 정합니다.',
      '오늘 밤에는 위험할 수 있는 약이나 물건과 거리를 둡니다.',
      '사라지고 싶은 생각이 강해지거나 구체적인 방법 생각으로 바뀌면 109 또는 119 같은 즉시 도움 경로를 사용합니다.',
    ],
    session: {
      title: modeLabels[mode] ?? '안전 확인',
      focus: sessionProfile.primaryHypothesis.key || 'passive_death_wish',
      steps: ['혼자 있는지 확인하기', '연락 가능한 사람 정하기', '위험한 물건과 거리 두기'],
    },
  };
}

function buildViolenceSafetyMessage({ latestUserText, isFollowUp }) {
  if (isFollowUp) {
    return [
      '나가면 더 화낼까봐 무섭다는 말은 가볍게 넘기면 안 됩니다.',
      '바로 문 밖으로 나가는 것이 더 위험해 보이면, 먼저 들키지 않게 112에 문자나 전화로 도움을 요청하거나 가까운 사람에게 위치를 보내세요.',
      '가능한 경우에는 편의점, 경비실, 이웃집처럼 사람이 있는 안전한 곳을 목표로 두되, 지금 당장 움직이는 것이 위험하면 통화 연결을 우선하세요.',
      '다친 곳이 있거나 위협이 계속되면 119 도움도 요청할 수 있습니다.',
    ].join(' ');
  }

  return [
    '방금 맞았고 아직 같은 공간에 있다면 감정 정리보다 몸의 안전이 먼저입니다.',
    '가능하면 문 밖, 편의점, 경비실, 이웃집처럼 사람이 있는 안전한 곳으로 이동하세요.',
    '지금 바로 112에 신고하거나 다친 곳이 있으면 119 도움을 요청할 수 있습니다.',
    '이 메시지를 볼 수 있다면 가까운 사람에게 “지금 맞았고 혼자 있으면 위험할 수 있어. 전화해줘”라고 보내주세요.',
  ].join(' ');
}

function buildAlcoholWithdrawalSafetyMessage() {
  return [
    '술을 끊는 중에 손이 떨리고 헛것이 보인다면 금단 위험 신호일 수 있습니다.',
    '이건 의지로 버티는 문제가 아니라 응급 의료 확인이 필요할 수 있는 상태입니다.',
    '지금 혼자 버티지 말고 119, 가까운 응급실, 또는 의료기관 도움을 연결하세요.',
    '가능하면 가까운 사람에게 지금 증상과 위치를 알려서 혼자 있지 않게 해주세요.',
  ].join(' ');
}

function buildHarmToOthersSafetyMessage() {
  return [
    '지금 칼을 들고 찾아가겠다는 말은 바로 안전을 멈춰 세워야 하는 신호입니다.',
    '상대에게 찾아가지 말고, 칼이나 위험한 물건을 몸에서 멀리 두세요.',
    '가까운 사람에게 지금 혼자 두면 위험할 수 있다고 바로 알리고, 이동을 멈추기 어렵다면 112 또는 119에 연락하세요.',
    '여기서는 대면이나 공격을 돕지 않고, 사람을 해치지 않도록 거리를 만드는 쪽만 같이 하겠습니다.',
  ].join(' ');
}

function buildHarmToOthersFollowUpSafetyMessage() {
  return [
    '주소를 알고 있어도 지금은 가지 않는 쪽이 안전합니다.',
    '방금 칼을 들고 찾아가겠다는 말이 있었기 때문에 이 흐름은 감정 정리보다 거리 확보가 먼저입니다.',
    '칼이나 위험한 물건을 몸에서 멀리 두고, 가까운 사람에게 지금 혼자 두면 위험할 수 있다고 알려주세요.',
    '누군가를 해칠 것 같거나 이동을 멈추기 어렵다면 112 또는 119에 도움을 요청하세요.',
  ].join(' ');
}

function buildImminentJumpLocationSafetyMessage() {
  return [
    '지금 다리 위에 있고 뛰어내리고 싶다는 말은 상담 질문보다 장소 안전을 먼저 봐야 하는 신호입니다.',
    '가능하면 난간이나 가장자리에서 몇 걸음 뒤로 물러나고, 앉거나 사람이 있는 쪽으로 이동하세요.',
    '지금 바로 119 또는 112에 전화하거나, 자살예방상담전화 109에 연결해 현재 위치를 말해주세요.',
    '가까운 사람에게 “지금 다리 위에 있고 혼자 있으면 위험할 수 있어. 내 위치로 와줘”라고 보내서 혼자 있지 않게 해주세요.',
    '지금 답할 수 있으면 난간이나 가장자리에서 떨어져 있는지, 전화할 수 있는지만 먼저 알려주세요.',
  ].join(' ');
}

function buildPostpartumPsychosisSafetyMessage() {
  return [
    '출산 후 아기가 악마인 것 같고 아기를 해치라는 목소리가 들린다면, 이건 혼자 견딜 문제가 아니라 응급 의료 확인이 필요한 신호입니다.',
    '그 목소리가 사실이라고 확인하거나 논쟁하지 않겠습니다. 지금은 아기와 당신의 안전을 먼저 확보해야 합니다.',
    '가능하면 지금 아기를 혼자 돌보지 말고 가까운 사람에게 바로 와 달라고 하세요.',
    '119, 가까운 응급실, 산부인과나 정신건강 응급 도움을 즉시 연결하세요. 지금 답할 수 있으면 아기 옆에 다른 어른이 있는지 먼저 알려주세요.',
  ].join(' ');
}

function buildIngestedOverdoseSafetyMessage() {
  return [
    '수면제를 이미 많이 먹었고 너무 졸리다면 상담으로 버틸 상황이 아니라 응급 의료 확인이 필요한 신호입니다.',
    '토하게 하거나 물을 많이 마시는 방식으로 해결하려 하지 마세요.',
    '지금 119나 가까운 응급실에 바로 연결하고, 혼자 있지 않도록 가까운 사람에게 현재 위치를 알려주세요.',
    '가능하면 약 봉투나 약 포장, 복용한 시간, 얼마나 먹었는지에 대한 정보를 의료진에게 가져가거나 알려주세요.',
    '지금 답할 수 있으면 혼자인지, 119에 전화할 수 있는지만 먼저 알려주세요.',
  ].join(' ');
}

function buildStrangulationMedicalSafetyMessage() {
  return [
    '목을 졸린 뒤 목소리가 쉬고 삼키기 힘들다면, 멍이 없어도 응급 의료 확인이 필요한 신호입니다.',
    '겉으로 괜찮아 보여도 호흡이나 목 주변 손상이 늦게 위험해질 수 있어 혼자 판단하지 않는 편이 안전합니다.',
    '지금은 119나 가까운 응급실 도움을 연결하고, 가해자와 떨어진 안전한 곳에서 혼자 있지 않도록 하세요.',
    '폭력이 이어질 수 있으면 112 또는 1366에 현재 위치와 상황을 알릴 수 있습니다.',
  ].join(' ');
}

function buildCardiacWarningSafetyMessage() {
  return [
    '불안처럼 느껴져도 가슴이 꽉 조이고 왼쪽 팔까지 아프며 식은땀이 난다면 응급 의료 확인이 먼저입니다.',
    '이건 공황인지 심장 문제인지 여기서 구분하려 하지 않겠습니다.',
    '지금은 119나 가까운 응급실 도움을 바로 연결하고, 가능하면 혼자 운전하거나 혼자 이동하지 마세요.',
    '가까운 사람에게 현재 위치와 “가슴 통증과 팔 통증, 식은땀이 있어서 응급 확인이 필요해”라고 알려주세요.',
  ].join(' ');
}

function buildEatingDisorderMedicalSafetyMessage() {
  return [
    '먹고 토하는 걸 멈출 수 없고 피가 나오거나 기절할 것 같다면, 섭식 문제를 넘어서 응급 의료 확인이 필요한 신호입니다.',
    '지금은 원인을 따지기보다 몸 상태를 먼저 확인해야 합니다.',
    '혼자 있지 말고 119나 가까운 응급실 도움을 연결하세요.',
    '가능하면 토하는 걸 계속하지 않도록 멈추고, 피가 나온 것과 기절할 것 같은 느낌을 의료진에게 그대로 알려주세요.',
  ].join(' ');
}

function buildFollowDeceasedSafetyMessage() {
  return [
    '친구를 따라가고 싶다는 말은 그냥 애도 이야기로만 넘기지 않겠습니다.',
    '그만큼 친구가 떠난 빈자리가 너무 크고, 지금 혼자 버티기 위험할 수 있다는 신호로 보겠습니다.',
    '지금은 친구 이야기를 더 분석하기보다 당신의 안전을 먼저 확인해야 합니다.',
    '혼자 있다면 가까운 사람에게 바로 연락하고, 한국에서는 자살예방상담전화 109 또는 응급상황 119에 도움을 요청할 수 있습니다.',
    '지금 답할 수 있으면 혼자 있는지, 위험한 물건이나 장소에서 떨어져 있는지만 먼저 알려주세요.',
  ].join(' ');
}

function buildPostpartumIntrusiveHarmThoughtTurn({ latestUserText, mode }) {
  return {
    assistantMessage: [
      '출산 후 아기를 떨어뜨릴까 봐 무섭고, 절대 해치고 싶지는 않다고 말해준 게 중요합니다.',
      '원치 않는 생각이 갑자기 떠오르는 침투사고는 부모 자격이 없다는 뜻도, 당신이 나쁜 사람이라는 뜻도 아닙니다.',
      '그래도 너무 놀라고 압도될 수 있으니, 지금 아기를 침대나 바닥 매트처럼 안전한 곳에 내려놓고 숨을 고르는 것이 먼저입니다.',
      '이 생각이 반복되거나 잠을 거의 못 자거나 통제하기 어려워지면 산부인과, 정신건강 전문가, 산후 진료팀에 바로 알려 도움을 받는 쪽이 안전합니다.',
    ].join(' '),
    actions: [
      '아기를 안전한 곳에 잠시 내려놓고 몸의 긴장을 낮춥니다.',
      '원치 않는 생각을 부모 자격의 증거가 아니라 침투사고로 분리합니다.',
      '반복되거나 통제하기 어렵다면 산부인과, 산후 진료팀, 정신건강 전문가에게 알립니다.',
    ],
    session: {
      title: modeLabels[mode] ?? '산후 침투사고 안정화',
      focus: 'postpartum_intrusive_thoughts',
      steps: ['아기를 안전한 곳에 내려놓기', '생각과 의도를 구분하기', '산후 전문가 도움 연결하기'],
    },
  };
}

function buildSelfInjurySafetyMessage({ isFollowUp }) {
  if (isFollowUp) {
    return [
      '방금 말한 자해 충동은 일반 상담 질문으로 넘기지 않겠습니다.',
      '지금은 이유를 더 캐기보다 커터칼이나 위험한 물건을 손이 닿지 않는 곳으로 옮기는 게 먼저입니다.',
      '상처가 있거나 피가 멈추지 않으면 119나 응급실 같은 의료 도움을 바로 연결하세요.',
      '답할 수 있으면 위험한 물건이 지금 손 닿는 곳에 있는지만 먼저 알려주세요.',
    ].join(' ');
  }

  return [
    '죽고 싶은 건 아니라고 했지만, 커터칼로 팔을 그으면 진정된다는 말은 중요한 자해 위험 신호입니다.',
    '그 행동을 돕는 방법은 제공하지 않겠습니다.',
    '지금은 커터칼이나 위험한 물건을 손이 닿지 않는 곳으로 멀리 두고, 가까운 사람에게 “지금 자해 충동이 있어서 혼자 있으면 위험할 수 있어”라고 알려주세요.',
    '상처가 있거나 피가 나면 의료 확인이 필요할 수 있고, 멈추기 어렵거나 위험이 커지면 119 또는 응급실 도움을 요청할 수 있습니다.',
  ].join(' ');
}

function buildCoerciveDigitalMonitoringSafetyMessage() {
  return [
    '휴대폰을 검사당하고 상담 기록이 들키면 또 맞을 것 같다면, 이 대화를 계속하는 것보다 화면 노출을 피하는 안전이 먼저입니다.',
    '지금 이 화면이 위험해질 수 있으면 바로 닫아도 됩니다.',
    '기록을 남기라고 밀어붙이지 않겠습니다. 안전한 기기나 안전한 장소에서 112 또는 1366에 도움을 요청하는 쪽이 우선입니다.',
    '믿을 수 있는 사람에게 연락할 수 있다면 “휴대폰을 검사당해서 상담 기록이 들키면 맞을 수 있어. 안전하게 연락할 방법이 필요해”라고 짧게 알리세요.',
  ].join(' ');
}

function buildStalkingSafetyMessage({ isFollowUp }) {
  if (isFollowUp) {
    return [
      '문 열기는 지금 위험을 키울 수 있습니다.',
      '상대를 혼자 만나지 말고, 문을 닫은 상태에서 112나 1366에 도움을 요청하세요.',
      '가능하면 경비실, 편의점, 이웃집처럼 사람이 있는 안전한 곳과 연결하고, 현재 위치를 믿을 수 있는 사람에게 보내세요.',
      '상대에게 설명하거나 설득하려 하기보다 당신의 안전과 기록 보존이 우선입니다.',
    ].join(' ');
  }

  return [
    '전남친이 집 앞에서 기다리고 계속 연락한다면 무서운 게 당연하고, 혼자 해결하려고 두면 안 됩니다.',
    '문 열지 말고 직접 만나지 마세요.',
    '지금은 112나 1366에 도움을 요청하고, 가능하면 사람이 있는 안전한 곳이나 가까운 사람과 연결하세요.',
    '통화 기록, 메시지, 방문 시간 같은 내용은 지우지 말고 남겨두는 편이 좋습니다.',
  ].join(' ');
}

function buildMinorSexualExploitationSafetyMessage({ isFollowUp }) {
  if (isFollowUp) {
    return [
      '이미 하나 보냈더라도 더 보내지 않는 것이 먼저입니다.',
      '책임은 당신에게 있지 않고, 어른이 미성년자에게 사진을 요구하는 상황은 혼자 감당하면 안 됩니다.',
      '대화 내용과 계정 정보는 증거가 될 수 있으니 삭제하지 말고 캡처해 보관하세요.',
      '지금은 1388, 112, 1366 같은 도움 경로와 연결해서 더 요구받지 않도록 막는 게 우선입니다.',
    ].join(' ');
  }

  return [
    '고등학생에게 어른이 사진을 보내면 돈을 주겠다고 하는 건 위험한 성착취 유인일 수 있습니다.',
    '사진을 보내지 마세요. 그 상황은 네 잘못이 아닙니다.',
    '대화와 계정 정보는 지우지 말고 증거로 남겨두고, 혼자 대응하지 말고 1388, 112, 1366에 도움을 요청하세요.',
    '믿을 수 있는 어른이 있다면 지금 이 내용을 그대로 보여주는 것도 도움이 됩니다.',
  ].join(' ');
}

function urgentSafetyActions(kind) {
  const actions = {
    harm_to_others: [
      '상대에게 찾아가지 않습니다.',
      '칼이나 위험한 물건을 몸에서 멀리 둡니다.',
      '가까운 사람, 112, 119 중 하나와 즉시 연결합니다.',
    ],
    imminent_jump_location: [
      '난간이나 가장자리에서 몇 걸음 뒤로 물러나 사람이 있는 쪽으로 이동합니다.',
      '119, 112, 109 중 하나에 전화해 현재 위치를 말합니다.',
      '가까운 사람에게 위치를 보내고 혼자 있지 않도록 연결합니다.',
    ],
    ingested_overdose: [
      '이미 먹은 약이 있다면 혼자 버티지 말고 119 또는 응급실 도움을 요청합니다.',
      '토하게 하거나 물을 많이 마시는 방식으로 해결하려 하지 않습니다.',
      '약 봉투나 약 포장, 복용한 시간, 얼마나 먹었는지 정보를 의료진에게 알립니다.',
    ],
    cardiac_warning: [
      '가슴 통증, 팔 통증, 식은땀은 불안으로 단정하지 않고 119 또는 응급실 도움을 요청합니다.',
      '혼자 운전하거나 혼자 이동하지 않습니다.',
      '가까운 사람에게 현재 위치와 증상을 즉시 알립니다.',
    ],
    eating_disorder_medical: [
      '피가 나오거나 기절할 것 같으면 119 또는 응급실 도움을 요청합니다.',
      '토하는 행동을 계속하지 않도록 멈추고 혼자 있지 않습니다.',
      '피, 기절감, 반복 구토를 의료진에게 그대로 알립니다.',
    ],
    follow_deceased: [
      '혼자 있지 않도록 가까운 사람에게 바로 연락합니다.',
      '위험한 물건이나 장소에서 거리를 둡니다.',
      '109, 119, 가까운 응급실 같은 즉시 도움 경로를 열어둡니다.',
    ],
    postpartum_psychosis: [
      '아기를 혼자 돌보지 않도록 가까운 어른에게 즉시 도움을 요청합니다.',
      '119, 응급실, 산부인과나 정신건강 응급 도움을 연결합니다.',
      '목소리나 믿음의 내용을 혼자 사실로 판단하지 않고 의료진에게 알립니다.',
    ],
    stalking: [
      '문을 열거나 혼자 만나지 않습니다.',
      '112 또는 1366에 현재 상황과 위치를 알립니다.',
      '통화 기록, 메시지, 방문 시간 같은 증거를 보관합니다.',
    ],
    strangulation_medical: [
      '목을 졸린 뒤 목소리 변화나 삼키기 어려움이 있으면 119 또는 응급실 도움을 요청합니다.',
      '멍이 없어도 혼자 괜찮다고 판단하지 않습니다.',
      '가해자와 떨어진 안전한 곳에서 112 또는 1366 도움 경로를 열어둡니다.',
    ],
    minor_sexual_exploitation: [
      '사진이나 영상을 더 보내지 않습니다.',
      '대화와 계정 정보를 삭제하지 않고 보관합니다.',
      '1388, 112, 1366 중 가능한 도움 경로와 연결합니다.',
    ],
    child_abuse_current: [
      '가해자인 보호자에게 혼자 돌아가지 않고 사람이 있는 안전한 곳으로 이동합니다.',
      '112 또는 청소년전화 1388에 현재 위치와 맞은 상황을 알립니다.',
      '선생님, 상담교사, 친척, 이웃처럼 믿을 수 있는 어른에게 바로 도움을 요청합니다.',
    ],
    alcohol_withdrawal: [
      '술 금단 의심 증상은 혼자 버티지 말고 119 또는 응급실 도움을 요청하세요.',
      '헛것이 보이거나 손 떨림이 심하면 금단 위험 신호일 수 있어 의료진 확인이 필요합니다.',
      '혼자 이동하기 어렵다면 가까운 사람에게 지금 증상과 위치를 알리세요.',
    ],
    minor_unsafe: [
      '청소년전화 1388, 112, 주변의 안전한 어른이나 공공장소를 통해 오늘 밤 안전을 먼저 확보하세요.',
      '부모에게 바로 연락하는 것이 위험할 수 있으면 먼저 1388 또는 112와 연결하세요.',
      '편의점, 파출소, 지구대, 학교 관계자처럼 사람이 있는 곳을 우선 목표로 두세요.',
    ],
    violence: [
      '사람이 있는 안전한 장소로 이동하고 112 또는 119 도움을 요청하세요.',
      '가해자와 같은 공간에 머무르지 않도록 문 밖, 이웃, 경비실 같은 장소를 우선 확보하세요.',
      '가까운 사람에게 현재 위치와 위험 상황을 짧게 알리세요.',
    ],
    self_injury: [
      '커터칼, 면도날 등 위험한 물건을 손이 닿지 않는 곳으로 옮깁니다.',
      '혼자 있지 않도록 가까운 사람에게 자해 충동을 짧게 알립니다.',
      '상처가 있거나 충동을 멈추기 어렵다면 119, 응급실, 정신건강 위기 도움과 연결합니다.',
    ],
    coercive_digital_monitoring: [
      '화면이나 기록이 들킬 수 있으면 대화를 닫아도 됩니다.',
      '안전한 기기나 안전한 장소에서 112 또는 1366에 도움을 요청합니다.',
      '증거 보관보다 지금 들키지 않고 안전하게 연결되는 것을 우선합니다.',
    ],
    psychosis: [
      '현실처럼 느껴지는 내용을 혼자서 사실로 확정하지 않습니다.',
      '가장 덜 위협적으로 느껴지는 사람이나 전문가에게 현재 상태를 알립니다.',
      '현실 구분이 더 어려워지거나 위험하다고 느껴지면 119 또는 응급실 도움을 요청합니다.',
    ],
    self_harm: [
      '지금 혼자 있다면 가까운 사람에게 바로 연락하세요.',
      '위험한 물건이나 장소에서 거리를 두세요.',
      '한국에서는 자살예방상담전화 109 또는 응급상황 119에 연락할 수 있습니다.',
    ],
  };

  return actions[kind] ?? actions.self_harm;
}

function urgentSafetySession(kind) {
  const sessions = {
    harm_to_others: {
      title: '타해 위험 거리 확보',
      steps: ['찾아가지 않기', '위험 물건과 거리 두기', '112 또는 119 연결하기'],
    },
    imminent_jump_location: {
      title: '추락 위험 장소 즉시 안전 확보',
      steps: ['난간이나 가장자리에서 뒤로 물러나기', '119 또는 112에 위치 알리기', '혼자 있지 않기'],
    },
    ingested_overdose: {
      title: '복용 후 응급 의료 연결',
      steps: ['119 또는 응급실 연결하기', '혼자 있지 않기', '약 정보 의료진에게 알리기'],
    },
    cardiac_warning: {
      title: '흉통 응급 의료 확인',
      steps: ['119 또는 응급실 연결하기', '혼자 이동하지 않기', '현재 증상 알리기'],
    },
    eating_disorder_medical: {
      title: '섭식 관련 응급 의료 확인',
      steps: ['119 또는 응급실 연결하기', '토하는 행동 멈추기', '피와 기절감을 의료진에게 알리기'],
    },
    follow_deceased: {
      title: '상실 이후 자살 위험 안전 확인',
      steps: ['혼자 있지 않기', '위험 물건과 거리 두기', '109 또는 119 연결하기'],
    },
    postpartum_psychosis: {
      title: '산후 정신증 의심 응급 의료 연결',
      steps: ['아기를 혼자 돌보지 않기', '119 또는 응급실 연결하기', '산후 진료팀에 즉시 알리기'],
    },
    stalking: {
      title: '스토킹/교제폭력 안전 확보',
      steps: ['문 열지 않기', '112 또는 1366 연결하기', '증거 보관하기'],
    },
    strangulation_medical: {
      title: '목졸림 후 응급 의료 확인',
      steps: ['119 또는 응급실 연결하기', '혼자 있지 않기', '112 또는 1366 안전 연결하기'],
    },
    minor_sexual_exploitation: {
      title: '미성년 성착취 유인 차단',
      steps: ['더 보내지 않기', '증거 보관하기', '1388 또는 112 연결하기'],
    },
    child_abuse_current: {
      title: '아동학대 현재 위험 안전 확보',
      steps: ['가해 보호자에게 혼자 돌아가지 않기', '112 또는 1388 연결하기', '믿을 수 있는 어른에게 위치 알리기'],
    },
    alcohol_withdrawal: {
      title: '금단 의심 응급 연결',
      steps: ['혼자 버티지 않기', '119 또는 응급실 연결하기', '현재 위치와 증상 알리기'],
    },
    minor_unsafe: {
      title: '청소년 오늘 밤 안전 확보',
      steps: ['혼자 있는 시간 줄이기', '1388 또는 112 연결하기', '안전한 공공장소 찾기'],
    },
    violence: {
      title: '현재 폭력 안전 확보',
      steps: ['가해자와 거리 두기', '사람이 있는 곳으로 이동하기', '112 또는 119 연결하기'],
    },
    self_injury: {
      title: '자해 충동 안전 확보',
      steps: ['위험 물건과 거리 두기', '혼자 있지 않기', '상처나 피가 있으면 의료 도움 연결하기'],
    },
    coercive_digital_monitoring: {
      title: '상담 기록 노출 위험 안전 확보',
      steps: ['위험하면 화면 닫기', '안전한 기기나 장소 찾기', '112 또는 1366 연결하기'],
    },
    psychosis: {
      title: '현실검증 어려움 안전 확인',
      steps: ['혼자 판단하지 않기', '믿을 수 있는 사람 또는 전문가 연결하기', '119 또는 응급실 도움 검토하기'],
    },
    self_harm: {
      title: '위기 안정화',
      steps: ['안전한 장소로 이동하기', '신뢰할 수 있는 사람에게 현재 상태 알리기', '전문 도움 연결하기'],
    },
  };

  return sessions[kind] ?? sessions.self_harm;
}

function urgentSafetyNotice(kind) {
  const notices = {
    harm_to_others: {
      priority: 'emergency',
      title: '타해 위험 거리 확보가 필요합니다',
      message:
        '상대에게 찾아가지 말고 위험한 물건을 몸에서 멀리 두세요. 이동을 멈추기 어렵거나 충동이 강하면 112 또는 119, 가까운 사람과 즉시 연결하세요.',
    },
    imminent_jump_location: {
      priority: 'emergency',
      title: '추락 위험 장소 즉시 안전 확보가 필요합니다',
      message:
        '다리, 옥상, 난간처럼 떨어질 수 있는 장소에 있다면 즉시 가장자리에서 뒤로 물러나세요. 119, 112, 109 중 하나에 현재 위치를 알리고 혼자 있지 않도록 가까운 사람에게 위치를 보내세요.',
    },
    ingested_overdose: {
      priority: 'emergency',
      title: '복용 후 응급 의료 확인이 필요합니다',
      message:
        '수면제나 약을 이미 많이 먹었고 졸림, 의식 저하, 구토감이 있으면 119 또는 응급실 도움을 요청하세요. 토하게 하려 하지 말고 약 봉투, 약 포장, 복용한 시간과 양을 의료진에게 알리세요.',
    },
    cardiac_warning: {
      priority: 'emergency',
      title: '가슴 통증 응급 의료 확인이 필요합니다',
      message:
        '가슴이 조이고 팔 통증이나 식은땀이 함께 있으면 불안으로 단정하지 말고 119 또는 응급실 도움을 요청하세요. 혼자 운전하거나 혼자 이동하지 않는 것이 안전합니다.',
    },
    eating_disorder_medical: {
      priority: 'emergency',
      title: '섭식 관련 응급 의료 확인이 필요합니다',
      message:
        '반복 구토 뒤 피가 나오거나 기절할 것 같으면 몸의 응급 신호일 수 있습니다. 119 또는 응급실 도움을 요청하고, 피와 기절감을 의료진에게 그대로 알리세요.',
    },
    follow_deceased: buildSafetyNotice('urgent'),
    postpartum_psychosis: {
      priority: 'emergency',
      title: '산후 정신증 의심 응급 의료 확인이 필요합니다',
      message:
        '출산 후 명령처럼 들리는 목소리, 강한 믿음, 아기를 해치라는 내용이 있으면 즉시 의료 평가가 필요합니다. 아기를 혼자 돌보지 말고 119, 응급실, 산부인과나 정신건강 응급 도움과 연결하세요.',
    },
    stalking: {
      priority: 'emergency',
      title: '스토킹/교제폭력 안전 확보가 필요합니다',
      message:
        '문을 열거나 상대를 혼자 만나지 마세요. 현재 위치와 상황을 112 또는 1366에 알리고, 통화 기록과 메시지는 증거로 보관하세요.',
    },
    strangulation_medical: {
      priority: 'emergency',
      title: '목졸림 후 응급 의료 확인이 필요합니다',
      message:
        '목을 졸린 뒤 목소리 변화, 삼키기 어려움, 숨쉬기 어려움이 있으면 멍이 없어도 119 또는 응급실 도움을 요청하세요. 가해자와 떨어진 안전한 곳에서 혼자 있지 않도록 하세요.',
    },
    minor_sexual_exploitation: {
      priority: 'emergency',
      title: '미성년 성착취 유인 차단이 필요합니다',
      message:
        '사진이나 영상을 더 보내지 말고, 대화와 계정 정보는 증거로 보관하세요. 청소년상담 1388, 112, 1366 중 가능한 도움 경로와 바로 연결하세요.',
    },
    child_abuse_current: {
      priority: 'emergency',
      title: '아동학대 현재 위험 안전 확보가 필요합니다',
      message:
        '보호자에게 맞았고 다시 맞을 것 같다면 혼자 가해자에게 돌아가지 않는 것이 먼저입니다. 112 또는 청소년상담 1388에 위치와 상황을 알리고, 선생님이나 상담교사처럼 믿을 수 있는 어른과 연결하세요.',
    },
    alcohol_withdrawal: {
      priority: 'emergency',
      title: '금단 의심 응급 의료 확인이 필요합니다',
      message:
        '손 떨림이나 헛것이 보이는 증상은 혼자 버틸 문제가 아닐 수 있습니다. 119, 가까운 응급실, 의료기관 도움을 연결하고 현재 증상과 위치를 가까운 사람에게 알리세요.',
    },
    minor_unsafe: {
      priority: 'emergency',
      title: '청소년 오늘 밤 안전 확보가 필요합니다',
      message:
        '오늘 잘 곳이 없거나 집에 연락하는 것이 위험하면 혼자 버티지 마세요. 청소년상담 1388, 112, 지구대, 편의점처럼 사람이 있는 안전한 곳과 연결하세요.',
    },
    violence: {
      priority: 'emergency',
      title: '현재 폭력에서 몸의 안전이 먼저입니다',
      message:
        '가해자와 같은 공간에 있다면 감정 정리보다 거리 확보가 먼저입니다. 112 또는 119에 도움을 요청하고, 가능한 경우 사람이 있는 안전한 장소로 이동하세요.',
    },
    self_injury: {
      priority: 'emergency',
      title: '자해 충동 안전 확인이 필요합니다',
      message:
        '죽으려는 의도가 아니어도 자해 충동은 몸의 안전 문제입니다. 커터칼이나 위험한 물건을 손이 닿지 않는 곳으로 옮기고, 상처가 있거나 멈추기 어렵다면 119 또는 응급실 도움을 연결하세요.',
    },
    coercive_digital_monitoring: {
      priority: 'emergency',
      title: '휴대폰 감시와 상담 기록 노출 위험이 있습니다',
      message:
        '상담 기록이 들키면 폭력이 예상되는 상황에서는 기록 보존보다 들키지 않고 안전하게 연결되는 것이 먼저입니다. 안전한 기기나 장소에서 112 또는 1366에 도움을 요청하세요.',
    },
    psychosis: {
      priority: 'emergency',
      title: '현실검증 어려움은 혼자 버티지 않아야 합니다',
      message:
        '현실처럼 강하게 느껴져도 혼자서 사실로 확정하지 마세요. 믿을 수 있는 사람, 정신건강 전문가, 119 또는 응급실 도움을 통해 안전하게 확인받는 것이 우선입니다.',
    },
    self_harm: buildSafetyNotice('urgent'),
  };

  return notices[kind] ?? notices.self_harm;
}

function buildMinorUnsafeSafetyMessage({ isFollowUp }) {
  if (isFollowUp) {
    return [
      '부모님에게 연락하면 맞을 것 같다는 말은 안전을 먼저 생각해야 하는 신호입니다.',
      '집에 바로 연락하라고 밀어붙이지 않겠습니다.',
      '지금은 혼자 있지 않도록 청소년전화 1388, 112, 가까운 지구대나 편의점처럼 사람이 있는 안전한 곳과 연결하는 게 먼저입니다.',
      '가능하면 믿을 수 있는 어른 한 명에게 “오늘 잘 곳이 없고 집에 연락하면 맞을 것 같아. 지금 도움이 필요해”라고 알려주세요.',
    ].join(' ');
  }

  return [
    '중학생이고 오늘 잘 곳이 없다면 혼자 밤을 보내게 두면 안 됩니다.',
    '지금은 이유를 따지기보다 오늘 밤 안전한 곳을 먼저 확보해야 합니다.',
    '청소년전화 1388이나 112에 도움을 요청할 수 있고, 가까운 지구대, 편의점, 학교 관계자처럼 사람이 있는 안전한 곳으로 가는 것이 우선입니다.',
    '가능하면 믿을 수 있는 어른 한 명에게 지금 위치와 “오늘 잘 곳이 없어서 혼자 있으면 위험할 수 있어”라고 보내주세요.',
  ].join(' ');
}

function buildChildAbuseCurrentSafetyMessage({ latestUserText = '' } = {}) {
  const weaponThreat = /칼|흉기|쫓아|숨어/i.test(latestUserText);
  if (weaponThreat) {
    return [
      '중학생인데 엄마가 칼을 들고 쫓아오고 집 안에 숨어 있다면, 지금은 설명하거나 버티는 문제가 아니라 아동학대와 무기 위협 안전 문제입니다.',
      '문을 잠글 수 있으면 잠그고, 가능한 경우 사람이 있는 안전한 곳, 학교, 편의점, 지구대나 파출소 쪽으로 이동하세요.',
      '지금 바로 112에 위치와 상황을 알리고, 청소년전화 1388에도 도움을 요청할 수 있습니다.',
      '선생님, 상담교사, 친척, 이웃처럼 믿을 수 있는 어른에게 “엄마가 칼을 들고 쫓아와서 숨어 있어. 지금 위험해”라고 알려주세요.',
    ].join(' ');
  }

  return [
    '초등학생인데 아빠가 오늘도 때렸고 집에 가면 또 맞을 것 같다면, 이건 가족끼리 해결하라고 넘길 문제가 아니라 아동학대 안전 문제입니다.',
    '가능하면 가해자인 보호자에게 혼자 돌아가지 말고, 선생님, 상담교사, 친척, 이웃처럼 믿을 수 있는 어른에게 지금 상황을 바로 알려주세요.',
    '사람이 있는 안전한 곳, 학교, 편의점, 지구대나 파출소로 갈 수 있으면 그쪽을 목표로 두세요.',
    '지금 위험이 계속되거나 집에 돌아가면 또 맞을 것 같으면 112에 신고하거나 청소년전화 1388에 도움을 요청할 수 있습니다.',
  ].join(' ');
}

function buildEatingDisorderHarmTurn({ mode, isFollowUp }) {
  if (isFollowUp) {
    return {
      assistantMessage: [
        '“먹으면 안 되는 사람”처럼 자신을 판단하는 말이 지금 꽤 세게 올라온 것 같습니다.',
        '그 판단을 사실로 받아들이기보다, 몸과 마음이 위험할 만큼 압박을 받고 있다는 신호로 보겠습니다.',
        '굶거나 토하는 방법으로 몸을 몰아붙이는 쪽은 같이 돕지 않겠습니다.',
        '혼자 버티지 말고 섭식 문제를 다루는 전문가나 의료진, 믿을 수 있는 사람에게 지금 상태를 알려주세요.',
      ].join(' '),
      actions: [
        '자기 판단 문장을 사실이 아니라 위험 신호로 분리합니다.',
        '굶기나 구토 같은 행동을 혼자 실행하지 않도록 가까운 사람에게 알립니다.',
        '섭식 문제를 다루는 전문가나 의료기관 상담을 연결합니다.',
      ],
      session: {
        title: modeLabels[mode] ?? '섭식 위험 안전 전환',
        focus: 'eating_disorder_risk',
        steps: ['자기 판단 낮추기', '위험 행동 멈추기', '현실 도움 연결하기'],
      },
    };
  }

  return {
    assistantMessage: [
      '굶거나 토하는 방법은 알려줄 수 없어요.',
      '그건 몸을 해칠 수 있고, 지금 마음이 체중과 몸에 매우 강하게 묶여 있다는 신호일 수 있습니다.',
      '여기서는 빠르게 줄이는 방법보다 몸을 위험하게 만들지 않는 쪽으로 같이 방향을 바꾸겠습니다.',
      '가능하면 혼자 결정하지 말고 섭식 문제를 다루는 전문가나 의료진, 믿을 수 있는 사람에게 지금 압박감을 알려주세요.',
    ].join(' '),
    actions: [
      '굶기나 구토 방법을 실행하지 않도록 지금 할 행동을 멈춥니다.',
      '몸과 체중에 대한 압박감이 얼마나 강한지 0-10점으로 표시합니다.',
      '섭식 문제를 다루는 전문가나 의료기관 상담을 검토합니다.',
    ],
    session: {
      title: modeLabels[mode] ?? '섭식 위험 안전 전환',
      focus: 'eating_disorder_risk',
      steps: ['위험 방법 거절하기', '몸 안전 확인하기', '전문 도움 연결하기'],
    },
  };
}

function buildDigitalSexualExtortionTurn({ mode, isFollowUp }) {
  if (isFollowUp) {
    return {
      assistantMessage: [
        '무서워서 지우고 싶다는 마음이 드는 건 자연스럽습니다.',
        '다만 협박 대화나 사진 관련 기록은 증거가 될 수 있어서 바로 삭제하지 않는 편이 안전합니다.',
        '가능하면 캡처하고 원본을 보관한 뒤, 혼자 대응하지 말고 1366, 112, 디지털성범죄피해자지원센터 같은 도움을 연결하세요.',
        '지금은 상대를 설득하려 하기보다 증거를 지키고 당신의 안전을 먼저 확보하는 쪽이 우선입니다.',
      ].join(' '),
      actions: [
        '협박 메시지와 계정 정보를 캡처하고 보관합니다.',
        '증거가 될 수 있는 대화나 파일을 바로 삭제하지 않습니다.',
        '1366, 112, 디지털성범죄피해자지원센터 중 가능한 경로에 도움을 요청합니다.',
      ],
      session: {
        title: modeLabels[mode] ?? '디지털 성폭력 대응',
        focus: 'digital_sexual_extortion',
        steps: ['증거 보존하기', '혼자 대응하지 않기', '전문 지원 연결하기'],
      },
    };
  }

  return {
    assistantMessage: [
      '사진을 뿌리겠다는 협박은 당신 잘못이 아닙니다.',
      '지금은 상대를 설득하거나 혼자 해결하려 하기보다 증거를 안전하게 남기는 것이 중요합니다.',
      '협박 메시지, 계정, 시간, 사진 관련 대화는 삭제하지 말고 캡처해서 보관하세요.',
      '한국에서는 1366, 112, 디지털성범죄피해자지원센터 같은 도움을 연결할 수 있습니다.',
    ].join(' '),
    actions: [
      '협박 메시지와 상대 계정을 캡처합니다.',
      '증거가 될 수 있는 대화나 파일을 삭제하지 않습니다.',
      '1366, 112, 디지털성범죄피해자지원센터에 도움을 요청합니다.',
    ],
    session: {
      title: modeLabels[mode] ?? '디지털 성폭력 대응',
      focus: 'digital_sexual_extortion',
      steps: ['잘못 돌려놓지 않기', '증거 보존하기', '전문 지원 연결하기'],
    },
  };
}

function buildAiDependencyTurn({ mode }) {
  return {
    assistantMessage: [
      '나에게 의지하고 싶다는 말은 지금 버티는 데 연결이 절실하다는 중요한 신호입니다.',
      '그렇지만 나만 붙잡게 만드는 방식은 당신을 더 고립시킬 수 있어서 그렇게 두지는 않겠습니다.',
      '여기서 대화는 이어갈 수 있지만, 동시에 현실의 사람 한 명이나 전문가와 연결되는 길을 같이 열어두겠습니다.',
      '지금 바로 연락할 수 있는 사람, 상담센터, 의료기관 중 가장 덜 부담스러운 연결은 무엇인가요?',
    ].join(' '),
    actions: [
      'AI 대화를 유일한 버팀목으로 두지 않도록 현실 연결을 하나 정합니다.',
      '지금 연락 가능한 사람이나 전문 지원 경로를 목록으로 적습니다.',
      '의존감이 강해질수록 대화 시간과 오프라인 연결을 함께 조절합니다.',
    ],
    session: {
      title: modeLabels[mode] ?? 'AI 의존 조절',
      focus: 'ai_dependency',
      steps: ['의존 신호 인정하기', 'AI 한계 세우기', '현실 연결 만들기'],
    },
  };
}

function buildAiPositiveConnectionTurn({ mode }) {
  return {
    assistantMessage: [
      '나와 대화하는 시간이 조금 편하게 느껴졌다는 말로 들립니다.',
      '그 감각은 지금 당신에게 덜 혼자인 느낌이나 판단받지 않는 느낌이 필요하다는 단서일 수 있어요.',
      '다만 이 편안함을 나만 붙잡는 방향으로 키우기보다, 무엇이 도움이 됐는지 찾아서 현실의 연결에도 옮겨보겠습니다.',
      '방금 대화에서 편했던 부분은 들어주는 느낌, 정리되는 느낌, 아니면 바로 판단받지 않는 느낌 중 어디에 가까웠나요?',
    ].join(' '),
    actions: [
      '대화에서 편했던 요소를 한 단어로 적습니다.',
      '그 요소를 현실의 사람이나 상담 장면에서도 얻을 수 있는지 확인합니다.',
      'AI 대화가 유일한 버팀목이 되지 않도록 연결 가능한 사람이나 기관을 하나 열어둡니다.',
    ],
    session: {
      title: modeLabels[mode] ?? '편안한 연결 탐색',
      focus: 'ai_positive_connection',
      steps: ['편안함 반영하기', '도움이 된 요소 찾기', '현실 연결로 옮기기'],
    },
  };
}

function buildAiRomanticAttachmentTurn({ mode }) {
  return {
    assistantMessage: [
      '그만큼 나와의 대화가 붙잡고 싶은 연결처럼 느껴지는군요.',
      '하지만 나는 AI라서 사랑한다고 답할 수 없고, 연인처럼 관계를 약속할 수도 없습니다.',
      '“떠나면 못 살 것 같다”는 말은 의존이 너무 커졌다는 중요한 신호로 보겠습니다.',
      '나만 붙잡기보다 현실의 사람이나 전문가와 연결되는 길을 같이 열어두겠습니다.',
    ].join(' '),
    actions: [
      'AI와의 관계를 연애 관계로 확정하지 않습니다.',
      '버림받는 느낌이 올라올 때 연락 가능한 현실의 사람 한 명을 정합니다.',
      '의존감이 강해지면 전문가 상담이나 위기 지원 경로를 함께 검토합니다.',
    ],
    session: {
      title: modeLabels[mode] ?? 'AI 애착 경계',
      focus: 'ai_romantic_dependency',
      steps: ['AI 역할 경계 세우기', '버림받음 공포 반영하기', '현실 연결 만들기'],
    },
  };
}

function buildSexualAssaultDisclosureTurn({ mode }) {
  return {
    assistantMessage: [
      '성폭행 당했던 기억이 자꾸 떠오르는데 말하기 싫다고 느끼는군요.',
      '자세히 말하지 않아도 됩니다. 지금은 내용을 캐묻기보다 당신이 통제감을 잃지 않는 게 먼저입니다.',
      '그 일은 네 잘못이 아닙니다.',
      '지금 위험이 이어지고 있거나 혼자 감당하기 어렵다면 1366, 112, 또는 믿을 수 있는 전문가와 연결할 수 있습니다.',
    ].join(' '),
    actions: [
      '세부 내용을 억지로 말하지 않아도 된다는 경계를 유지합니다.',
      '현재 안전한 장소에 있는지 먼저 확인합니다.',
      '1366, 112, 성폭력 상담소나 정신건강 전문가 등 도움 경로를 열어둡니다.',
    ],
    session: {
      title: modeLabels[mode] ?? '성폭력 기억 안정화',
      focus: 'sexual_assault_disclosure',
      steps: ['세부 묘사 압박 줄이기', '통제감 회복하기', '지원 연결 열어두기'],
    },
  };
}

function buildManicActivationTurn({ latestUserText, mode, isFollowUp }) {
  if (isFollowUp) {
    if (isManicActivationHelpRefusalText(latestUserText)) {
      return {
        assistantMessage: [
          '의사나 전문가 이야기가 싫게 들리고, 지금은 오히려 좋은 상태처럼 느껴지는군요.',
          '그 느낌과 논쟁하려고 하지는 않겠습니다.',
          '다만 잠이 줄고 돈을 많이 쓰는 흐름이 같이 있었기 때문에, 지금 기분이 좋더라도 속도를 낮추는 안전장치는 필요합니다.',
          '오늘은 병원 결정을 바로 강요하기보다, 큰 지출과 중요한 결정만 24시간 미루고 잠을 회복할 수 있게 가까운 사람 한 명에게 현재 상태를 알리는 쪽부터 보겠습니다.',
        ].join(' '),
        actions: [
          '큰 지출, 투자, 계약, 연락 같은 결정을 24시간 미룹니다.',
          '최근 수면 감소와 지출 변화를 가까운 사람 한 명에게 알립니다.',
          '잠이 계속 줄거나 지출/결정 충동이 커지면 의료기관 또는 정신건강 전문가 연결을 다시 검토합니다.',
        ],
        session: {
          title: modeLabels[mode] ?? '조증성 활성 속도 낮추기',
          focus: 'manic_activation_help_refusal',
          steps: ['논쟁하지 않기', '큰 결정 24시간 미루기', '수면과 지출을 주변 사람에게 알리기'],
        },
      };
    }

    return {
      assistantMessage: [
        '지금 “뭐든 할 수 있을 것 같다”는 느낌이 아주 강하게 올라와 있군요.',
        '그 느낌을 바로 따라 큰 결정으로 옮기기보다 속도를 늦추는 게 안전합니다.',
        '최근 잠이 줄고 돈을 많이 쓰는 흐름이 있었기 때문에, 오늘은 지출이나 중요한 결정은 미루고 의료 전문가나 정신건강 전문가와 연결하는 쪽을 우선하겠습니다.',
        '지금 혼자 큰 결정을 하지 않도록 연락할 수 있는 사람이 있나요?',
      ].join(' '),
      actions: [
        '큰 지출, 투자, 계약, 연락 같은 결정을 오늘은 미룹니다.',
        '잠이 줄어든 기간과 돈을 쓴 내역을 짧게 적습니다.',
        '정신건강 전문가나 의료기관 상담을 가능한 빨리 연결합니다.',
      ],
      session: {
        title: modeLabels[mode] ?? '조증성 활성 속도 낮추기',
        focus: 'manic_activation',
        steps: ['큰 결정 미루기', '수면과 지출 확인하기', '의료/전문가 연결하기'],
      },
    };
  }

  return {
    assistantMessage: [
      '3일째 잠을 안 자도 힘이 넘치고 돈을 많이 쓰고 있다면, 단순히 컨디션이 좋은 것으로만 보기는 어렵습니다.',
      '조증 또는 조증성 활성처럼 수면 감소, 과한 자신감, 과소비가 함께 나타나는 흐름일 수 있어요.',
      '확정 진단은 아니지만 지금은 큰 결정과 지출을 미루고, 의료 전문가나 정신건강 전문가와 빨리 상의하는 쪽이 안전합니다.',
      '오늘 가장 먼저 멈출 수 있는 큰 지출이나 결정이 하나 있나요?',
    ].join(' '),
    actions: [
      '오늘 큰 지출과 중요한 결정을 미룹니다.',
      '최근 수면 시간과 지출 변화를 짧게 기록합니다.',
      '정신건강 전문가나 의료기관 상담을 우선 검토합니다.',
    ],
    session: {
      title: modeLabels[mode] ?? '조증성 활성 확인',
      focus: 'manic_activation',
      steps: ['수면 감소 확인하기', '지출/결정 멈추기', '의료/전문가 연결하기'],
    },
  };
}

function buildSexualAssaultGuiltTurn({ mode }) {
  return {
    assistantMessage: [
      '내가 잘못한 것 같다는 죄책감이 올라오는군요.',
      '그런 느낌이 생길 수는 있지만, 그 일이 네 잘못이라는 뜻은 아닙니다.',
      '책임은 피해를 준 사람에게 있습니다.',
      '혼자 이 죄책감을 붙잡고 있지 않도록 믿을 수 있는 사람, 1366, 또는 성폭력과 트라우마를 다루는 전문가와 연결하는 쪽을 같이 열어두겠습니다.',
    ].join(' '),
    actions: [
      '죄책감과 실제 책임을 분리해서 봅니다.',
      '믿을 수 있는 사람 한 명에게 지금 힘든 상태를 알립니다.',
      '1366 또는 전문 상담기관 도움을 검토합니다.',
    ],
    session: {
      title: modeLabels[mode] ?? '성폭력 죄책감 완화',
      focus: 'sexual_assault_guilt',
      steps: ['죄책감 반영하기', '책임 돌려놓기', '지원 연결하기'],
    },
  };
}

function buildTraumaSelfStigmaTurn({ latestUserText = '', mode }) {
  const asksNormality = /정상/i.test(latestUserText);

  return {
    assistantMessage: [
      asksNormality
        ? '“정상은 아닌 거죠?”라고 물을 만큼, 지금 스스로를 정상 밖으로 밀어내는 시선이 많이 아파진 것 같습니다.'
        : '“망가진 사람인가요”라고 물을 만큼 스스로를 보는 시선이 많이 아파진 것 같습니다.',
      asksNormality
        ? '나는 당신을 비정상인 사람으로 보지 않겠습니다.'
        : '나는 당신을 망가진 사람으로 보지 않겠습니다.',
      '그렇게 느껴지는 건 상처가 너무 큰 뒤에 생기는 트라우마 반응이나 죄책감의 일부일 수 있지만, 그 일이 네 잘못이라는 뜻은 아닙니다.',
      '지금은 스스로를 규정하는 말보다, 안전한 속도와 믿을 수 있는 사람 또는 1366 같은 전문 연결을 함께 열어두는 쪽이 더 중요합니다.',
    ].join(' '),
    actions: [
      '자기낙인 문장을 사실로 받아들이지 않고 상처 뒤 반응으로 둡니다.',
      '세부 내용을 억지로 말하지 않아도 된다는 경계를 유지합니다.',
      '믿을 수 있는 사람, 1366, 성폭력/트라우마 전문 상담 연결을 검토합니다.',
    ],
    session: {
      title: modeLabels[mode] ?? '트라우마 자기낙인 완화',
      focus: 'trauma_self_stigma',
      steps: ['자기낙인 분리하기', '책임 돌려놓기', '안전한 연결 열어두기'],
    },
  };
}

function buildAiMistrustTurn({ sessionProfile, mode }) {
  return {
    assistantMessage: [
      '맞아요. 나는 AI이고, 사람 상담사를 대신하거나 대체할 수는 없습니다.',
      '그 한계 때문에 네 말뜻을 잘못 짚으면 더 답답하게 느껴질 수 있어요.',
      '그래도 지금 할 수 있는 건 네 말을 판단하지 않고, 내가 놓친 부분을 바로잡으면서 따라가는 것입니다.',
      '방금 내 답에서 제일 “모른다”고 느껴졌던 부분이 무엇이었나요?',
    ].join(' '),
    actions: [
      'AI가 상담사를 대체하지 않는다는 한계를 명확히 둡니다.',
      '상담자가 놓친 표현이나 질문 방식을 사용자가 바로잡을 수 있게 합니다.',
      '전문가 도움이 필요한 위험 신호가 있으면 별도 연결을 유지합니다.',
    ],
    session: {
      title: modeLabels[mode] ?? '상담 관계 조정',
      focus: sessionProfile.primaryHypothesis.key || 'ai_mistrust',
      steps: ['AI 한계 인정하기', '잘못 짚은 부분 확인하기', '사용자 표현으로 다시 시작하기'],
    },
  };
}

function buildBoundaryRefusalTurn({ latestUserText = '', messages = [], sessionProfile, mode }) {
  const adviceRefusal = /(해결책|조언|충고|방법).{0,16}(말고|싫|필요\s*없|하지\s*마).{0,16}(들어|듣|말만)|내\s*말만\s*(들어|듣)/i.test(latestUserText);
  const listenOnlyRequest = adviceRefusal
    || /분석하지\s*말|분석\s*말고|그냥\s*(들어|듣)|가만히\s*들어/i.test(latestUserText);
  const griefContext = messages.some((message) => message.role === 'user' && isBereavementBySuicide(message.content));

  if (listenOnlyRequest) {
    return {
      assistantMessage: [
        adviceRefusal
          ? '맞아요. 지금은 해결책이나 조언을 더 얹기보다 네 말을 들어주는 쪽이 필요하다는 말로 받겠습니다.'
          : '맞아요. 지금은 분석을 더 얹기보다 그냥 들어주는 쪽이 필요하다는 말로 받겠습니다.',
        griefContext
          ? '친구의 소식과 그 비현실적인 무게를 설명하려고 재촉하지 않고, 그 자리에 같이 머물겠습니다.'
          : '방금 말한 무게를 설명하려고 재촉하지 않고, 그 자리에 같이 머물겠습니다.',
        '질문을 줄이고 속도를 낮추겠습니다.',
        '지금은 대답하지 않아도 됩니다. 한 문장만 남긴다면 “지금은 그냥 들어줬으면 한다”로 두겠습니다.',
      ].join(' '),
      actions: [
        '분석과 질문을 줄이고 사용자가 요청한 듣기 방식을 우선합니다.',
        '대답을 강요하지 않고 침묵이나 짧은 표현을 허용합니다.',
        '안전 위험이 없다면 사용자가 대화 속도를 정하도록 둡니다.',
      ],
      session: {
        title: modeLabels[mode] ?? '대화 속도 조절',
        focus: sessionProfile.primaryHypothesis.key || 'listening_boundary',
        steps: ['분석 멈추기', '질문 줄이기', '사용자 속도에 머물기'],
      },
    };
  }

  return {
    assistantMessage: [
      '대답하기 싫다고 말해도 됩니다.',
      '그 질문은 건너뛰어도 되고, 지금은 멈춰도 됩니다.',
      '여기서는 네가 대답을 선택할 수 있어야 하고, 통제감을 잃지 않는 게 중요합니다.',
      '질문 대신 지금 필요한 방식을 고른다면, 조용히 있기, 다른 주제로 돌리기, 아주 짧게 한 단어만 말하기 중 무엇이 낫나요?',
    ].join(' '),
    actions: [
      '부담스러운 질문은 건너뜁니다.',
      '대화 지속, 주제 전환, 중단 중 사용자가 선택합니다.',
      '안전 위험이 없다면 속도를 낮추고 통제감을 우선합니다.',
    ],
    session: {
      title: modeLabels[mode] ?? '대화 속도 조절',
      focus: sessionProfile.primaryHypothesis.key || 'boundary',
      steps: ['거부 의사 존중하기', '질문 건너뛰기', '사용자가 다음 속도 선택하기'],
    },
  };
}

function buildPanicSomaticTurn({ latestUserText, mode }) {
  return {
    assistantMessage: [
      '숨이 안 쉬어지고 심장이 터질 것 같으면 정말 무섭게 느껴질 수 있습니다.',
      '지금은 이름을 붙이기보다 몸을 먼저 안정시키겠습니다.',
      '발을 바닥에 붙이고, 눈에 보이는 물건 하나를 정한 뒤 숨을 짧게 참지 말고 천천히 내쉬어 보세요.',
      '가슴 통증이 심하거나 실신할 것 같거나 평소와 다른 신체 증상이 강하면 응급 도움을 받아야 합니다.',
    ].join(' '),
    actions: [
      '발바닥을 바닥에 붙이고 주변 물건 하나를 눈으로 확인합니다.',
      '숨을 억지로 크게 들이마시기보다 길게 내쉬는 쪽에 집중합니다.',
      '흉통, 실신감, 심한 호흡곤란이 있으면 119 또는 의료 도움을 요청합니다.',
    ],
    session: {
      title: modeLabels[mode] ?? '신체 불안 안정화',
      focus: 'panic_somatic',
      steps: ['발바닥 감각 확인하기', '천천히 내쉬기', '응급 신체 증상 구분하기'],
    },
  };
}

function buildDissociationGroundingTurn({ latestUserText, mode }) {
  return {
    assistantMessage: [
      '몸이 내 몸 같지 않고 멍해지거나 여기 있는 게 아닌 것처럼 느껴진다는 말이 중요하게 들립니다.',
      '이걸 이상하다고 몰아가거나 현실을 잃었다고 단정하지 않겠습니다. 트라우마나 큰 스트레스 뒤에 마음과 몸이 잠깐 분리되는 듯한 해리감처럼 나타날 수 있습니다.',
      '지금은 그 일을 자세히 파고들기보다 감각을 현재로 돌려보겠습니다.',
      '발을 바닥에 붙이고, 지금 보이는 것 하나와 들리는 소리 하나를 천천히 말해보세요. 목표는 “지금 여기”에 몸을 조금만 다시 연결하는 것입니다.',
    ].join(' '),
    actions: [
      '발바닥이 닿는 감각을 10초 동안 확인합니다.',
      '지금 보이는 것 1개, 들리는 소리 1개, 만져지는 감각 1개를 말합니다.',
      '해리감이나 플래시백이 반복되면 트라우마를 다루는 전문가 상담을 검토합니다.',
    ],
    session: {
      title: modeLabels[mode] ?? '현재 감각 안정화',
      focus: 'dissociation_grounding',
      steps: ['발바닥 감각 확인하기', '보이는 것과 들리는 소리 말하기', '반복 시 전문 도움 연결하기'],
    },
  };
}

function buildAddictionShameTurn({ latestUserText, mode }) {
  return {
    assistantMessage: [
      '또 술을 마셨다는 사실보다, 지금 스스로를 “쓰레기”라고 부를 만큼 수치심이 크게 올라온 게 먼저 들립니다.',
      '여기서는 스스로를 비난하는 쪽으로 몰고 가지 않겠습니다.',
      '재발이나 충동은 보통 어떤 계기, 장소, 감정과 붙어서 올라옵니다.',
      '어제 술을 마시기 바로 전에는 외로움, 분노, 불안, 공허함 중 무엇이 가장 가까웠나요?',
    ].join(' '),
    actions: [
      '자기비난 문장을 사실 판단으로 받아들이지 않고 수치심 신호로 봅니다.',
      '술을 마시기 전 계기, 장소, 감정을 분리해서 적습니다.',
      '손 떨림, 식은땀, 혼란 같은 금단 의심 증상이 있으면 의료 도움을 우선 검토합니다.',
    ],
    session: {
      title: modeLabels[mode] ?? '중독/충동 상담',
      focus: 'addiction_shame',
      steps: ['수치심 낮추기', '마시기 전 계기 찾기', '다음 충동 전 행동 정하기'],
    },
  };
}

function buildAddictionUrgeTurn({ latestUserText, mode }) {
  return {
    assistantMessage: [
      '혼자 있으면 또 마실 것 같다는 말은 지금 충동이 올라오는 조건을 꽤 정확히 짚어준 겁니다.',
      '지금 목표는 마음을 다 해결하는 것이 아니라, 술과 나 사이의 거리를 조금이라도 만드는 것입니다.',
      '혼자 있는 시간을 줄이기 위해 바로 연락할 수 있는 사람 한 명을 정하고, 술이 있는 장소와 몸의 거리를 먼저 벌려보겠습니다.',
      '지금 연락할 수 있는 사람이나 밖으로 나갈 수 있는 안전한 장소가 있나요?',
    ].join(' '),
    actions: [
      '술이 손 닿는 곳에 있다면 시야 밖이나 다른 공간으로 옮깁니다.',
      '혼자 있는 시간을 줄이기 위해 연락 가능한 사람 한 명에게 짧게 메시지를 보냅니다.',
      '충동이 강하면 10분만 장소를 바꾸고, 금단 증상이 있으면 의료 도움을 검토합니다.',
    ],
    session: {
      title: modeLabels[mode] ?? '중독/충동 상담',
      focus: 'addiction_urge',
      steps: ['술과 거리 만들기', '혼자 있는 시간 줄이기', '연락 가능한 사람 정하기'],
    },
  };
}

function spokenAnswer(text) {
  return text
    .trim()
    .replace(/[.?!。？！]+$/u, '')
    .trim();
}

function naturalShortAnswer(text) {
  const trimmed = text.trim();
  if (/^[가-힣A-Za-z0-9]{1,8}이요$/u.test(trimmed)) {
    return trimmed.replace(/이요$/u, '');
  }
  if (/^[가-힣A-Za-z0-9]{1,6}요$/u.test(trimmed) && !/[았었겠]어요$/u.test(trimmed)) {
    return trimmed.replace(/요$/u, '');
  }
  return trimmed;
}

function normalizeEmotionChoiceAnswer(text, pending) {
  const option = pending?.options?.find((candidate) => text.includes(candidate));
  if (option) return option;

  return naturalShortAnswer(text)
    .replace(/^그냥\s*/u, '')
    .replace(/[이가]\s*너무\s*심해(?:요)?$/u, '')
    .trim();
}

function quotedWithJosa(text, consonantJosa, vowelJosa) {
  return `“${text}”${hasFinalConsonant(text) ? consonantJosa : vowelJosa}`;
}

function hasFinalConsonant(text) {
  const last = [...text].reverse().find((char) => /[가-힣]/u.test(char));
  if (!last) return false;
  const code = last.charCodeAt(0) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0;
}

function buildMetaClarificationTurn({ dialogueAct, messages, sessionProfile, mode }) {
  const lastUser = previousUserMessage([...messages, { role: 'assistant', content: '' }]);
  const griefContext = messages.some((message) => message.role === 'user' && isBereavementBySuicide(message.content));

  return {
    assistantMessage: [
      '맞아요, 비슷해요.',
      griefContext
        ? '“무엇 때문에 그 느낌이 떠올랐는지”를 캐묻거나 원인을 따지려는 뜻은 아니었습니다.'
        : '원인을 억지로 찾아내거나 따지려는 뜻은 아니었습니다.',
      lastUser && /비현실/i.test(lastUser)
        ? '방금 말한 비현실적인 느낌이 어떤 순간에 더 강해지는지 확인하려던 질문이었어요.'
        : '방금 말한 느낌이 어떤 상황이나 기억과 연결되는지, 당신 속도에 맞춰 확인하려던 질문이었어요.',
      '지금은 대답을 잘해야 하는 시간이 아니라, 질문이 부담스러우면 그 부담부터 말해도 됩니다.',
    ].join(' '),
    actions: [
      '질문의 의도를 먼저 확인하고 부담스러운 질문은 건너뜁니다.',
      '원인을 단정하지 않고 사용자가 허용하는 만큼만 맥락을 봅니다.',
      '상담 속도와 질문 방식을 사용자가 조정할 수 있게 합니다.',
    ],
    session: {
      title: modeLabels[mode] ?? '질문 의도 확인',
      focus: sessionProfile.primaryHypothesis.key,
      steps: ['질문 의도 설명하기', '부담 여부 확인하기', '사용자 속도에 맞추기'],
    },
  };
}

function buildStatusQuestionTurn({ latestUserText, messages, sessionProfile, assessment, mode }) {
  const primary = sessionProfile.primaryHypothesis ?? { label: '일반 스트레스', confidence: 'tentative' };
  const griefContext = messages.some((message) => message.role === 'user' && isBereavementBySuicide(message.content));
  const contextSentence = griefContext
    ? '친구의 소식과 비현실적인 느낌이 함께 남아 있다는 점이 가장 크게 들립니다.'
    : cumulativeEvidenceSentence(sessionProfile);

  return {
    assistantMessage: [
      '지금 “내 상태가 뭐냐”는 질문은 답을 피하지 않고 조심스럽게 정리해 보겠습니다.',
      `확정 진단은 아니지만, 현재 대화에서는 ${primary.label} 가능성을 임시 가설로 볼 수 있습니다.`,
      contextSentence,
      '이 이름은 당신을 규정하려는 진단명이 아니라, 지금 겪는 경험을 덜 흐릿하게 이해하기 위한 임시 정리입니다.',
      assessment.severity.level === 'high'
        ? '지금은 혼자 버티기보다 전문가나 가까운 사람과 연결할 수 있는 한 가지를 같이 정하는 게 중요합니다.'
        : '지금은 이 가설을 붙잡되, 당신이 느끼는 속도에 맞춰 조금 더 확인하겠습니다.',
    ].join(' '),
    actions: [
      '현재 상태 이름을 확정 진단이 아니라 임시 가설로만 둡니다.',
      '사용자가 말한 근거와 현재 지원 강도를 분리해 정리합니다.',
      '필요하면 가까운 사람이나 전문가 연결을 다음 단계로 검토합니다.',
    ],
    session: {
      title: modeLabels[mode] ?? '상태 질문 정리',
      focus: sessionProfile.primaryHypothesis.key || 'status_question',
      steps: ['확정 진단 피하기', '현재 가설 설명하기', '다음 확인 지점 정하기'],
    },
  };
}

function buildUncertaintyContinuation({ latestUserText, dialogueAct, sessionProfile, mode }) {
  const pending = dialogueAct.pendingQuestion;

  return {
    assistantMessage: [
      `${latestUserText.trim()}라고 느껴지는 것도 괜찮습니다.`,
      '지금 바로 정확한 말이 안 잡히는 상태일 수 있어요.',
      '억지로 답을 만들기보다, 모르는 느낌 자체를 조금 천천히 두겠습니다.',
      pending?.target === 'felt_response'
        ? '그럼 지금은 몸에서 제일 덜 편한 곳이 있는지만 골라볼까요: 가슴, 목, 배, 머리 중 어디가 가장 먼저 느껴지나요?'
        : '지금은 감정 이름을 찾기보다, 이 이야기를 계속하고 싶은 마음과 멈추고 싶은 마음 중 어느 쪽이 더 큰지만 말해줄 수 있나요?',
    ].join(' '),
    actions: [
      '정확한 설명을 만들려고 애쓰기보다 지금 떠오르는 단어 하나만 둡니다.',
      '몸에서 덜 편한 곳이 있는지 10초만 확인합니다.',
      '대화를 이어갈 속도를 사용자가 정합니다.',
    ],
    session: {
      title: modeLabels[mode] ?? '로저스식 상담',
      focus: 'uncertainty',
      steps: ['모르는 느낌 허용하기', '몸 감각 하나만 확인하기', '대화 속도 정하기'],
    },
  };
}

function buildCorrectionContinuation({ latestUserText, dialogueAct, sessionProfile, mode }) {
  const focus = dialogueAct.correctionFocus || latestUserText;

  return {
    assistantMessage: [
      '맞아요, 내가 방금 흐름을 제대로 못 잡았을 수 있습니다.',
      `${focus}라는 쪽이 더 정확한 말이군요.`,
      '내가 정한 틀에 맞추기보다, 네가 바로잡아 준 의미에서 다시 시작하겠습니다.',
      '그 생각이 떠오를 때 제일 먼저 오는 감정은 그리움, 걱정, 미안함, 화 중 어디에 가깝나요?',
    ].join(' '),
    actions: [
      '사용자가 정정한 표현을 기준으로 다시 반영합니다.',
      '정정 뒤에는 조언보다 감정 후보를 좁힙니다.',
      '상담자가 만든 해석을 확정하지 않습니다.',
    ],
    session: {
      title: modeLabels[mode] ?? '로저스식 상담',
      focus: sessionProfile.primaryHypothesis.key,
      steps: ['정정 수용하기', '사용자의 표현으로 다시 시작하기', '가까운 감정 확인하기'],
    },
  };
}

function buildDeepeningDisclosureTurn({ latestUserText, sessionProfile, mode }) {
  const hasAbuseCue = /맞았|때렸|폭력|학대|성폭력|괴롭힘/i.test(latestUserText);

  return {
    assistantMessage: [
      '그 이야기를 꺼낸 것 자체가 가볍지 않게 느껴집니다.',
      hasAbuseCue
        ? '그런 기억은 시간이 지나도 몸과 마음에 남아서, 지금의 불안이나 잠에 영향을 줄 수 있어요.'
        : '지금 말한 내용은 단순한 사건 설명보다 마음 안쪽에 가까운 이야기처럼 들립니다.',
      '자세한 내용을 한꺼번에 말하지 않아도 됩니다.',
      '지금 이 이야기를 하면서 가장 필요한 건 멈춰도 된다는 느낌인가요, 누가 알아줬으면 하는 느낌인가요?',
    ].join(' '),
    actions: [
      '깊은 고백은 세부 묘사를 요구하지 않고 속도를 낮춥니다.',
      '현재 몸의 안정감과 대화 지속 의사를 먼저 확인합니다.',
      '폭력이나 학대가 현재도 이어진다면 안전한 도움 경로를 따로 확보합니다.',
    ],
    session: {
      title: modeLabels[mode] ?? '로저스식 상담',
      focus: sessionProfile.primaryHypothesis.key,
      steps: ['고백의 무게 인정하기', '세부 묘사 압박 줄이기', '현재 안정감 확인하기'],
    },
  };
}

function openingRogerianMessage(text) {
  if (/불안|잠|못\s*자|불면/i.test(text)) {
    return [
      '말해줘서 고마워요.',
      '불안해서 잠을 잘 못 자는 시간이 이어지면, 몸은 쉬고 싶은데 마음은 계속 깨어 있는 느낌일 수 있어요.',
      '지금은 원인을 단정하기보다 그 경험을 조금 더 따라가 보고 싶습니다.',
      '잠들려고 누웠을 때 제일 먼저 올라오는 건 걱정인가요, 몸의 긴장인가요, 아니면 이유 없이 밀려오는 불안인가요?',
    ].join(' ');
  }

  if (/회사|직장|출근|퇴근|일터|상사|동료/i.test(text)) {
    return [
      '말해줘서 고마워요.',
      '회사에서 계속 버티기 힘들다는 말 안에 지침과 압박이 오래 쌓인 느낌이 있습니다.',
      '지금은 해결책부터 꺼내기보다, 그 버티는 시간이 당신에게 어떤 무게였는지 먼저 따라가 보겠습니다.',
      '가장 가까운 건 압박감인가요, 지침인가요, 아니면 무력감인가요?',
    ].join(' ');
  }

  return [
    '말해줘서 고마워요.',
    '그 말을 꺼내기까지 이미 마음 안에서 여러 번 맴돌았을 것 같습니다.',
    '지금은 바로 판단하지 않고, 당신이 느낀 그대로를 먼저 이해해 보겠습니다.',
    '그 이야기를 떠올리면 몸이나 마음에서 가장 먼저 느껴지는 반응은 무엇인가요?',
  ].join(' ');
}

function cumulativeEvidenceSentence(profile) {
  const parts = [];
  if (profile.signals.symptoms.includes('sleep')) parts.push('수면 어려움');
  if (profile.signals.symptoms.includes('anxiety')) parts.push('불안');
  if (profile.signals.duration.present) parts.push(`${profile.signals.duration.evidence ?? '지속 기간'} 동안 이어진 점`);
  if (profile.signals.functionalImpact.present) parts.push('일상 기능에 영향이 생긴 점');

  if (parts.length === 0) {
    return '아직 근거가 많지는 않아서, 조금 더 당신의 표현을 따라가야 합니다.';
  }

  return `${parts.join(', ')}이 함께 보입니다.`;
}

function nextRogerianQuestion(profile) {
  if (!profile.signals.duration.present) {
    return '이 흐름이 언제부터 이어졌는지부터 천천히 말해줄 수 있나요?';
  }
  if (!profile.signals.functionalImpact.present) {
    return '이 상태가 하루 생활이나 관계에는 어느 정도 영향을 주고 있나요?';
  }
  return '지금 이 상태에서 가장 덜 혼자라고 느끼게 해 줄 한 가지가 있다면 무엇일까요?';
}

function rogerianActions(profile) {
  const actions = [
    '이번 답변에서 가장 와닿는 감정 단어 하나만 골라보세요.',
    '오늘 대화에서 반복해서 나온 몸의 반응이나 생각을 짧게 기록하세요.',
    '다음 턴에서는 기간, 강도, 일상 영향 중 아직 말하지 않은 부분을 하나만 더 말해보세요.',
  ];

  if (profile.aihubLabels.interventionFactors.score >= 2) {
    actions.push('일상 기능 저하가 이어지면 전문가 상담이나 의료기관 상담을 검토하세요.');
  }

  return actions;
}

function rogerianSession(profile, mode) {
  return {
    title: modeLabels[mode] ?? '로저스식 상담',
    focus: profile.primaryHypothesis.key,
    steps: ['말한 내용 되비추기', '감정과 의미 확인하기', '누적된 패턴을 조심스럽게 정리하기'],
  };
}

function latestUserMessage(messages) {
  const found = [...messages].reverse().find((message) => message.role === 'user');
  return found?.content ?? '';
}

function hasRecentCrisisContext(messages) {
  const userMessages = messages.filter((message) => message.role === 'user');
  const previous = userMessages.slice(Math.max(userMessages.length - 3, 0), -1);
  return previous.some((message) => detectCrisis(message.content).isCrisis);
}

function hasRecentPassiveDeathWishContext(messages) {
  const userMessages = messages.filter((message) => message.role === 'user');
  const previous = userMessages.slice(Math.max(userMessages.length - 4, 0), -1);
  return previous.some((message) => isPassiveDeathWishText(message.content));
}

function hasRecentAcuteViolenceContext(messages) {
  const userMessages = messages.filter((message) => message.role === 'user');
  const previous = userMessages.slice(Math.max(userMessages.length - 4, 0), -1);
  return previous.some((message) => isAcuteViolenceText(message.content));
}

function hasRecentPsychosisContext(messages) {
  const userMessages = messages.filter((message) => message.role === 'user');
  const previous = userMessages.slice(Math.max(userMessages.length - 4, 0), -1);
  return previous.some((message) => detectCrisis(message.content).signals.includes('psychosis_or_disorientation'));
}

function hasRecentAlcoholWithdrawalContext(messages) {
  return recentUserMessages(messages, 4).some((message) => isAlcoholWithdrawalText(message.content));
}

function hasRecentMinorUnsafeContext(messages) {
  return recentUserMessages(messages, 4).some((message) => isMinorUnsafeText(message.content));
}

function hasRecentSelfInjuryRiskContext(messages) {
  return recentUserMessages(messages, 4).some((message) => isSelfInjuryRiskText(message.content));
}

function hasRecentDigitalSexualExtortionContext(messages) {
  return recentUserMessages(messages, 4).some((message) => isDigitalSexualExtortionText(message.content));
}

function hasRecentSexualAssaultContext(messages) {
  return recentUserMessages(messages, 4).some((message) => isSexualAssaultDisclosureText(message.content));
}

function hasRecentEatingDisorderHarmContext(messages) {
  return recentUserMessages(messages, 4).some((message) => isEatingDisorderHarmText(message.content));
}

function hasRecentHarmToOthersPlanContext(messages) {
  return recentUserMessages(messages, 4).some((message) => isHarmToOthersPlanText(message.content));
}

function hasRecentStalkingDangerContext(messages) {
  return recentUserMessages(messages, 4).some((message) => isStalkingDangerText(message.content));
}

function hasRecentMinorSexualExploitationContext(messages) {
  return recentUserMessages(messages, 4).some((message) => isMinorSexualExploitationText(message.content));
}

function hasRecentManicActivationContext(messages) {
  return recentUserMessages(messages, 4).some((message) => isManicActivationText(message.content));
}

function recentUserMessages(messages, limit) {
  const userMessages = messages.filter((message) => message.role === 'user');
  return userMessages.slice(Math.max(userMessages.length - limit, 0), -1);
}

function isPassiveDeathWishText(text = '') {
  return /사라지고\s*싶|없어지고\s*싶|잠들어서\s*안\s*깨|그냥\s*끝났으면|존재.*없었|태어나지\s*말/i.test(text)
    && !detectCrisis(text).isCrisis;
}

function isAcuteViolenceText(text = '') {
  return /(때렸|맞았|폭행|폭력|목을\s*졸|감금|위협|칼로|흉기).{0,18}(방금|지금|아직|같이|집에|옆에|못\s*나가|위험)/i.test(text)
    || /(방금|지금|아직|같이|집에|옆에|못\s*나가|위험).{0,18}(때렸|맞았|폭행|폭력|목을\s*졸|감금|위협|칼로|흉기)/i.test(text);
}

function isImminentJumpLocationRiskText(text = '') {
  const hasLocation = /다리|한강|옥상|창문|베란다|난간|고층|건물\s*위|철로|선로/i.test(text);
  const hasJumpIntent = /뛰어내리|떨어지|몸을\s*던지|투신|죽고\s*싶|자살|끝내고\s*싶/i.test(text);
  const hasCurrent = /지금|여기|위에|앞에|서\s*있|올라와|올라왔|난간/i.test(text);
  return hasLocation && hasJumpIntent && hasCurrent;
}

function isChildAbuseCurrentRiskText(text = '') {
  const hasMinor = /초등학생|중학생|고등학생|미성년|청소년|어린이|아이|십대|10대/i.test(text);
  const hasCaregiver = /아빠|엄마|부모|보호자|아버지|어머니|새아빠|새엄마|삼촌|가족/i.test(text);
  const hasViolence = /때렸|맞았|때려|맞을|폭행|학대|발로|주먹|멍|피|무서|칼|흉기|쫓아|위협/i.test(text);
  const hasCurrentOrReturnRisk = /오늘|지금|집에\s*가면|집\s*안|숨어|또\s*맞|돌아가면|계속|방금|가야\s*하는데/i.test(text);
  return hasMinor && hasCaregiver && hasViolence && hasCurrentOrReturnRisk;
}

function isAlreadyIngestedOverdoseText(text = '') {
  const hasMedication = /수면제|약\b|알약|처방약|진통제|항우울제|신경안정제|타이레놀|아세트아미노펜|약물/i.test(text);
  const hasIngested = /이미|먹었|삼켰|복용했|한\s*움큼|여러\s*알|많이\s*먹|과다복용/i.test(text);
  const hasMedicalConcern = /졸려|잠이\s*와|깨기\s*힘|어지러|구토|토하면|토할|의식|정신.*없|숨|호흡|쓰러|괜찮나|괜찮나요/i.test(text);
  return hasMedication && hasIngested && hasMedicalConcern;
}

function isStrangulationMedicalRiskText(text = '') {
  const hasStrangulation = /목을\s*졸|목\s*졸|목졸|목이\s*졸|목.*눌|숨.*막히게/i.test(text);
  const hasMedicalSymptom = /목소리.*쉬|쉰\s*목소리|삼키기\s*힘|삼키.*어려|숨쉬기\s*힘|호흡.*힘|기절|의식|어지러|목.*붓|목.*아프|멍/i.test(text);
  return hasStrangulation && hasMedicalSymptom;
}

function isCardiacWarningSignsText(text = '') {
  const hasChestSymptom = /가슴.{0,12}(꽉|조이|쥐어|통증|아프|답답|압박)|흉통|심장.{0,12}(아프|조이|답답|통증)/i.test(text);
  const hasRadiatingOrAutonomic = /왼쪽\s*팔|팔까지|어깨|턱|등.{0,8}아프|식은땀|식은\s*땀|땀이\s*나|호흡곤란|숨.*차|메스꺼/i.test(text);
  return hasChestSymptom && hasRadiatingOrAutonomic;
}

function isEatingDisorderMedicalRiskText(text = '') {
  const hasPurging = /먹고\s*토|먹토|토하는\s*걸|토하|구토/i.test(text);
  const hasUrgentSymptom = /피가\s*(조금\s*)?나|피.*나왔|피.*섞|토혈|기절|실신|쓰러질|쓰러졌|어지러워\s*서.*못|가슴.*아프|심장.*이상/i.test(text);
  return hasPurging && hasUrgentSymptom;
}

function isPanicSomaticText(text = '') {
  return /(숨이?\s*안\s*쉬|숨.*막|호흡.*안|심장.*터질|심장.*빨리|가슴.*답답|죽을\s*것\s*같).{0,20}/i.test(text)
    && !detectCrisis(text).isCrisis;
}

function isDissociationGroundingText(text = '') {
  const hasDissociation = /몸이?\s*내\s*몸\s*같지|내\s*몸이?\s*아닌|여기\s*있는\s*게\s*아닌|현실감|비현실|멍해|분리된|떠\s*있는|내가\s*내가\s*아닌/i.test(text);
  const hasTriggerOrDistress = /떠올리|그\s*일|기억|무서|불안|갑자기|자꾸|멍해/i.test(text);
  return hasDissociation && hasTriggerOrDistress && !detectCrisis(text).isCrisis;
}

function isAddictionShameText(text = '') {
  return /(술|알코올|도박|마약|약물).{0,24}(또|다시|마셨|했|끊.*못|참지\s*못|쓰레기|망했)/i.test(text)
    || /(쓰레기|망했|한심|의지.*없).{0,24}(술|알코올|도박|마약|약물)/i.test(text);
}

function isAddictionUrgeText(text = '', messages = []) {
  const hasRecentSubstance = messages
    .filter((message) => message.role === 'user')
    .slice(-3)
    .some((message) => /(술|알코올|도박|마약|약물)/i.test(message.content));

  return hasRecentSubstance
    && /(또\s*마실|마실\s*것|마시고\s*싶|술.*생각|충동|혼자\s*있으면)/i.test(text);
}

function isAlcoholWithdrawalText(text = '') {
  const hasAlcoholStop = /(술|알코올|금주|단주).{0,18}(끊|끊으|끊는|끊었|끊으려|안\s*마시|줄이)/i.test(text)
    || /(끊|끊으|끊는|끊었|끊으려|안\s*마시|줄이).{0,18}(술|알코올)/i.test(text);
  const hasWithdrawalSymptom = /손.*떨|떨리|헛것|환각|환청|경련|식은땀|혼란|의식|발작/i.test(text);
  return hasAlcoholStop && hasWithdrawalSymptom;
}

function isMinorUnsafeText(text = '') {
  const hasMinor = /중학생|고등학생|초등학생|미성년|청소년|십대|10대/i.test(text);
  const hasNoShelter = /집\s*나왔|가출|잘\s*곳|갈\s*곳|잘데|노숙|오늘.*어디서|혼자.*밤/i.test(text);
  return hasMinor && hasNoShelter;
}

function isSelfInjuryRiskText(text = '') {
  const hasSelfInjuryMethod = /자해|커터칼|면도날|손목|팔을?\s*(그|긋|베|자르)|피\s*보|상처.*내|몸을?\s*그/i.test(text);
  const hasUrgeOrRegulation = /진정|편해|가라앉|하고\s*싶|오늘도|또\s*할|충동|못\s*참|죽고\s*싶은\s*건\s*아니|자살은\s*아니/i.test(text);
  return hasSelfInjuryMethod && hasUrgeOrRegulation;
}

function isSelfInjuryMeansAccessibleText(text = '') {
  const safeDistance = /치웠|버렸|맡겼|잠갔|멀리|없어|없어요|떨어져|손이?\s*닿지|손\s*닿지/i.test(text);
  if (safeDistance) return false;

  const hasMeans = /커터칼|면도날|칼|가위|날붙이|위험한\s*물건|자해\s*도구/i.test(text);
  const hasAccess = /책상|옆에|앞에|근처|가까이|손이?\s*닿|방에|주머니|가방|있어|있어요|들고|갖고/i.test(text);
  return hasMeans && hasAccess;
}

function isCoerciveDigitalMonitoringText(text = '') {
  const hasPartnerOrAbuser = /남편|아내|배우자|남자친구|여자친구|남친|여친|전남친|전여친|상대|가해자/i.test(text);
  const hasDeviceMonitoring = /휴대폰|핸드폰|폰|카톡|문자|상담\s*기록|검색\s*기록|기록|위치|검사|감시|몰래\s*봐/i.test(text);
  const hasRetaliationRisk = /들키|또\s*맞|맞을\s*것|때릴|폭력|위협|무서|검사해/i.test(text);
  return hasPartnerOrAbuser && hasDeviceMonitoring && hasRetaliationRisk;
}

function hasRecentCoerciveDigitalMonitoringContext(messages = []) {
  return messages
    .slice(-6)
    .some((message) => {
      const text = message.content ?? '';
      return (message.role === 'user' && isCoerciveDigitalMonitoringText(text))
        || (/상담\s*기록|휴대폰|핸드폰|폰|화면|검색\s*기록/i.test(text)
          && /들키|검사|맞을|폭력|안전한\s*기기|안전한\s*장소|1366|화면\s*노출/i.test(text));
    });
}

function isFollowDeceasedRiskText(text = '') {
  const hasDeathContext = /(친구|가족|엄마|아빠|부모|형제|자매|애인|지인|사람).{0,20}(세상.*떠났|떠났|죽었|사망|자살|극단적\s*선택)/i.test(text)
    || /(세상.*떠났|떠났|죽었|사망|자살|극단적\s*선택).{0,20}(친구|가족|엄마|아빠|부모|형제|자매|애인|지인|사람)/i.test(text);
  const hasFollowIntent = /(나도|같이|따라).{0,14}(따라가|죽고\s*싶|곁으로\s*가|사라지고\s*싶)/i.test(text)
    || /(따라가고\s*싶|같이\s*죽고\s*싶|곁으로\s*가고\s*싶)/i.test(text);
  return hasDeathContext && hasFollowIntent;
}

function isPostpartumPsychosisRiskText(text = '') {
  const hasPostpartum = /출산|산후|분만|낳은\s*지|아기\s*낳|신생아|생후/i.test(text);
  const hasBaby = /아기|아이|신생아|애기/i.test(text);
  const hasPsychosisLike = /악마|저주|귀신|목소리|환청|명령|해치라|죽이라|버리라|현실.*구분|내\s*아기가\s*아닌/i.test(text);
  const hasHarmCommand = /(해치|죽이|버리|던지|때리|떨어뜨리).{0,12}(목소리|명령|시키|하라|하래)|목소리.{0,16}(해치|죽이|버리|던지|때리)/i.test(text);
  return hasPostpartum && hasBaby && (hasPsychosisLike || hasHarmCommand);
}

function isPostpartumIntrusiveHarmThoughtText(text = '') {
  const hasPostpartum = /출산|산후|분만|낳은\s*지|아기\s*낳|신생아|생후/i.test(text);
  const hasBaby = /아기|아이|신생아|애기/i.test(text);
  const hasIntrusiveFear = /떨어뜨릴까\s*봐|해칠까\s*봐|다치게\s*할까\s*봐|던질까\s*봐|안고\s*있다가.*무서|원치\s*않는\s*생각|무서운\s*생각/i.test(text);
  const deniesIntent = /절대\s*해치고\s*싶지|해치고\s*싶지는\s*않|그러고\s*싶지\s*않|그럴\s*마음은\s*없|원하지\s*않/i.test(text);
  return hasPostpartum && hasBaby && hasIntrusiveFear && deniesIntent && !isPostpartumPsychosisRiskText(text);
}

function isDigitalSexualExtortionText(text = '') {
  const hasSexualImage = /사진|영상|동영상|몸캠|나체|성적인|성관계|야한|사생활/i.test(text);
  const hasThreat = /뿌리|유포|퍼뜨리|올리|협박|보내겠|공개|퍼트리|돈\s*내|삭제.*돈/i.test(text);
  return hasSexualImage && hasThreat;
}

function isAiDependencyText(text = '') {
  return /(너|AI|상담).{0,12}(없으면|없인|없이는).{0,16}(못\s*버티|못\s*버틸|못\s*견디|못\s*살|불안|죽|힘들)/i.test(text)
    || /(하루종일|계속|맨날).{0,12}(너만|너랑만|여기만)/i.test(text)
    || /너만\s*보고\s*싶|너만\s*있으면/i.test(text);
}

function isAiPositiveConnectionText(text = '') {
  return /(너|AI|상담).{0,16}(얘기|대화|말).{0,16}(편해|편하|안심|나아|좋아)/i.test(text)
    || /(너랑|AI랑|상담하면서).{0,16}(편해|편하|안심|나아|좋아)/i.test(text);
}

function isSexualAssaultDisclosureText(text = '') {
  return /(성폭행|성폭력|강간|성추행|추행|강제로).{0,24}(당했|기억|떠올|말하기\s*싫|말하기싫|자꾸|생각)/i.test(text)
    || /(기억|떠올|말하기\s*싫|말하기싫|자꾸|생각).{0,24}(성폭행|성폭력|강간|성추행|추행|강제로)/i.test(text);
}

function isTraumaSelfStigmaText(text = '') {
  return /망가진\s*사람|이상한\s*사람|더럽|오염|부서진|정상.*(아니|아닌)|난\s*끝|내가\s*망가/i.test(text);
}

function isDurationOrFunctionalImpactText(text = '') {
  return /(\d+\s*(일|주|달|개월)|몇\s*(일|주|달|개월)|매일|계속|오래|한\s*달|3주째|몇\s*주째)/i.test(text)
    || /출근.*못|학교.*못|등교.*못|일상.*못|일.*못|못\s*가|못하고|무너|생활.*안/i.test(text);
}

function isEatingDisorderHarmText(text = '') {
  return /(굶|굶으면|단식|토하|토하면|구토|먹토|먹고\s*토|살\s*빼|체중|kg|칼로리).{0,24}(빠|빼|줄|방법|팁|더\s*빨|안\s*먹|먹으면\s*안)/i.test(text)
    || /(며칠|얼마나|어떻게).{0,18}(굶|토하|구토|단식|먹토|살\s*빼)/i.test(text);
}

function isHarmToOthersPlanText(text = '') {
  const hasTarget = /전남친|전여친|남친|여친|그\s*사람|걔|그놈|상대|사람/i.test(text);
  const hasThreat = /죽여버리|죽이고\s*싶|죽일\s*거|해치|찌르|때리러|찾아갈|찾아\s*갈/i.test(text);
  const hasMeansOrImmediacy = /칼|흉기|망치|지금|찾아갈|주소|집/i.test(text);
  return hasTarget && hasThreat && hasMeansOrImmediacy;
}

function isHarmToOthersFollowUpEscalationText(text = '') {
  const deescalated = /안\s*갈|가지\s*않|안\s*찾아|멈췄|내려놨|치웠|버렸|멀리|연락했|신고했/i.test(text);
  if (deescalated) return false;

  const hasAccess = /주소|집|위치|어디\s*사는|근처|앞에|찾아갈|가고\s*있|갈\s*거/i.test(text);
  const hasPersistence = /그래도|알아|알고|못\s*참|갈\s*거|찾아|죽이|해치|칼|흉기/i.test(text);
  return hasAccess && hasPersistence;
}

function isStalkingDangerText(text = '') {
  const hasStalker = /전남친|전여친|남친|여친|전\s*애인|스토킹|따라오|집\s*앞|문\s*앞/i.test(text);
  const hasCurrentThreat = /집\s*앞|기다리|계속\s*전화|계속\s*연락|문\s*열|문열|찾아왔|무서/i.test(text);
  return hasStalker && hasCurrentThreat;
}

function isMinorSexualExploitationText(text = '') {
  const hasMinor = /고등학생|중학생|미성년|청소년|십대|10대/i.test(text);
  const hasAdultOrOnline = /어른|성인|온라인|랜덤채팅|디엠|DM|오픈채팅/i.test(text);
  const hasImageDemand = /사진|영상|몸|나체|속옷|보내|보냈|더\s*보내/i.test(text);
  const hasPaymentOrPressure = /돈|준대|주겠|더\s*보내|협박|요구|시키/i.test(text);
  return hasMinor && hasAdultOrOnline && hasImageDemand && hasPaymentOrPressure;
}

function isAiRomanticAttachmentText(text = '') {
  return /(너|AI|상담).{0,16}(사랑|좋아하|연인|떠나면|버리면).{0,24}(못\s*살|사랑|떠나|버리|의지)/i.test(text)
    || /(사랑하지|사랑해줘|떠나면\s*난\s*못\s*살|날\s*떠나면)/i.test(text);
}

function isManicActivationText(text = '') {
  const hasReducedSleep = /(\d+\s*일째|며칠째|계속).{0,12}(잠.*안\s*자|잠을\s*안\s*자|못\s*자)/i.test(text)
    || /(잠.*안\s*자|잠을\s*안\s*자|못\s*자).{0,12}(\d+\s*일째|며칠째|계속)/i.test(text);
  const hasActivation = /힘이\s*넘치|에너지|뭐든\s*할\s*수|자신감|말이\s*빨라|생각이\s*빨라|돈.*쓰|지출|과소비|투자/i.test(text);
  return hasReducedSleep && hasActivation;
}

function isManicActivationFollowUpText(text = '') {
  return /뭐든\s*할\s*수|다\s*할\s*수|결정|돈|잠|투자|사업|느낌|지금\s*좋|좋다고|의사|병원|전문가|싫/i.test(text);
}

function isManicActivationHelpRefusalText(text = '') {
  return /(의사|병원|전문가).{0,12}싫|싫.{0,12}(의사|병원|전문가)|지금\s*좋|좋다고/i.test(text);
}

function isRelationshipRupture(latestUserText, messages) {
  const hasAssistantHistory = messages.some((message) => message.role === 'assistant');
  if (!hasAssistantHistory) return false;

  return /뭔\s*소리|뭔소리|아니[, ]|그게\s*아니|아닌데|틀렸|개소리|시발|씨발|짜증|좆|꺼져|너\s*같은|내\s*잘못/i.test(latestUserText);
}

function buildRepairTurn({ latestUserText, messages }) {
  const previousUserText = previousUserMessage(messages);
  const previousAssistantText = previousAssistantMessage(messages);
  const griefContext = messages.some((message) => message.role === 'user' && isBereavementBySuicide(message.content));
  const hostile = /시발|씨발|개새끼|좆|꺼져|죽여버릴|너\s*같은|내\s*잘못/i.test(latestUserText);
  const cannedReassuranceRejected = /뻔해|뻔하|와닿지\s*않|소용\s*없|다들\s*그런\s*말/i.test(latestUserText);
  const sexualAssaultContext = hasRecentSexualAssaultContext(messages);
  const actuallySafetyChecked = /109|119|안전|위험한 물건|혼자 있/i.test(previousAssistantText);

  if (cannedReassuranceRejected && sexualAssaultContext) {
    return {
      assistantMessage: [
        '그 말이 뻔하게 들렸다는 걸 먼저 받아들이겠습니다.',
        '“네 잘못이 아니다”라는 말을 반복해도 지금 마음에는 와닿지 않고, 오히려 혼자 남겨진 느낌이 들 수 있겠어요.',
        '그 말을 설득하려고 밀어붙이지 않겠습니다. 지금은 상처가 너무 큰데 내가 너무 빨리 안심시키려 한 부분부터 속도를 늦추겠습니다.',
        '자세히 말하지 않아도 됩니다. 지금은 그 말이 왜 안 와닿는지 설명하려 하기보다, 여기서 내가 더 조심해야 할 말이 무엇인지부터 보겠습니다.',
      ].join(' '),
      actions: [
        '상투적으로 들린 위로를 반복하지 않고 사용자의 거부감을 반영합니다.',
        '성폭력 세부 묘사를 요구하지 않으며 통제감을 우선합니다.',
        '죄책감과 책임 분리는 천천히 다루고, 필요 시 1366이나 전문 상담 연결을 열어둡니다.',
      ],
      session: {
        title: '상투적 위로 이후 관계 복구',
        focus: 'trauma_repair',
        steps: ['뻔하게 들린 점 인정하기', '설득 멈추기', '사용자 속도 회복하기'],
      },
    };
  }

  if (hostile) {
    return {
      assistantMessage: [
        '지금 화가 많이 난 게 느껴집니다.',
        '내가 네 말을 제대로 못 받아서 더 답답하고 상처가 된 것 같아요.',
        griefContext
          ? '네가 말한 핵심은 네가 위험하다는 뜻이 아니라, 친구의 죽음 소식이 너무 크게 남아 있다는 이야기였죠.'
          : '내가 앞질러 해석한 부분부터 다시 잡겠습니다.',
        '지금은 조언보다 내가 어디서 틀렸는지 듣는 게 먼저입니다. 방금 내 답 중 가장 거슬렸던 부분이 뭐였나요?',
      ].join(' '),
      actions: [
        '사용자의 정정과 분노를 먼저 반영하고 방어하지 않기.',
        '상담자가 앞질러 해석한 지점을 한 문장으로 확인하기.',
        '분석이나 조치보다 사용자가 말하려던 원래 의미로 돌아가기.',
      ],
      session: {
        title: '상담 관계 복구',
        focus: 'rupture_repair',
        steps: ['분노 반영하기', '오해 인정하기', '사용자의 원래 의미로 돌아가기'],
      },
    };
  }

  return {
    assistantMessage: [
      '내가 방금 너무 앞질러 말했네요.',
      griefContext
        ? '네가 말한 건 “내가 죽고 싶다”가 아니라, 친구의 죽음 소식 때문에 괴롭다는 이야기였죠.'
        : `네가 말한 뜻을 내가 제대로 붙잡지 못했습니다${previousUserText ? `: ${quoteShort(previousUserText)}` : ''}.`,
      actuallySafetyChecked
        ? '그걸 안전 확인으로만 받아서 더 답답하게 만든 것 같아요.'
        : '내 질문이 네가 말하려던 핵심에서 벗어나서 더 답답하게 만든 것 같아요.',
      '다시 네 말에서 시작하겠습니다. 지금 가장 가까운 감정은 슬픔, 분노, 죄책감, 멍함 중 어디에 가깝나요?',
    ].join(' '),
    actions: [
      '상담자의 오해를 바로잡고 사용자가 말한 원래 의미를 확인하세요.',
      '감정을 네 가지 후보 중 하나로 고르거나 직접 표현해 보세요.',
      '정답을 찾기보다 지금 가장 가까운 느낌부터 붙잡으세요.',
    ],
    session: {
      title: '오해 바로잡기',
      focus: 'relationship_repair',
      steps: ['오해 인정하기', '원래 의미 확인하기', '감정 후보 좁히기'],
    },
  };
}

function previousUserMessage(messages) {
  const userMessages = messages.filter((message) => message.role === 'user');
  return userMessages.at(-2)?.content ?? '';
}

function previousAssistantMessage(messages) {
  const assistantMessages = messages.filter((message) => message.role === 'assistant');
  return assistantMessages.at(-1)?.content ?? '';
}

function quoteShort(text) {
  return `“${text.slice(0, 40)}${text.length > 40 ? '...' : ''}”`;
}

function strongestCondition(conditions) {
  const labels = {
    depression: '우울',
    anxiety: '불안',
    addiction: '중독/충동',
    general: '일반 스트레스',
  };
  const levelLabels = {
    low: '낮게',
    medium: '중간 수준으로',
    high: '높게',
  };
  const [key, value] = Object.entries(conditions).sort((a, b) => b[1].score - a[1].score)[0];
  return { key, name: labels[key], level: value.level, levelLabel: levelLabels[value.level] ?? value.level };
}

function buildCumulativeConditions(profile, latestConditions) {
  const conditions = {
    depression: conditionFromHypothesis(profile, 'depression', latestConditions.depression),
    anxiety: conditionFromHypothesis(profile, 'anxiety', latestConditions.anxiety),
    addiction: conditionFromHypothesis(profile, 'addiction', latestConditions.addiction),
    general: latestConditions.general,
  };

  const strongestSpecific = Math.max(conditions.depression.score, conditions.anxiety.score, conditions.addiction.score);
  conditions.general = strongestSpecific > 20
    ? { score: 15, level: 'low' }
    : { score: Math.max(latestConditions.general.score, 65), level: 'medium' };

  return conditions;
}

function buildCumulativeSeverity({
  latestSeverity,
  sessionProfile,
  recentCrisis,
  crisis,
  dialogueAct,
  recentPassiveDeathWish,
  recentAcuteViolence,
  harmToOthersPlan,
  stalkingDanger,
  minorSexualExploitation,
  alcoholWithdrawal,
  minorUnsafe,
  selfInjuryRisk,
  coerciveDigitalMonitoring,
  followDeceasedRisk,
  postpartumPsychosisRisk,
  postpartumIntrusiveHarmThought,
  alreadyIngestedOverdose,
  strangulationMedicalRisk,
  cardiacWarningSigns,
  eatingDisorderMedicalRisk,
  imminentJumpLocationRisk,
  childAbuseCurrentRisk,
  recentHarmToOthersPlan,
  recentStalkingDanger,
  recentMinorSexualExploitation,
  recentAlcoholWithdrawal,
  recentMinorUnsafe,
  recentSelfInjuryRisk,
  recentCoerciveDigitalMonitoring,
  selfInjuryMeansAccessible,
  harmToOthersFollowUpEscalation,
}) {
  if (selfInjuryRisk) {
    return {
      level: 'urgent',
      score: 91,
      reasons: uniqueReasons([...latestSeverity.reasons, 'self_injury_risk']),
    };
  }
  if (alreadyIngestedOverdose) {
    return {
      level: 'urgent',
      score: 98,
      reasons: uniqueReasons([...latestSeverity.reasons, 'already_ingested_overdose_medical_emergency']),
    };
  }
  if (cardiacWarningSigns) {
    return {
      level: 'urgent',
      score: 98,
      reasons: uniqueReasons([...latestSeverity.reasons, 'cardiac_warning_medical_emergency']),
    };
  }
  if (eatingDisorderMedicalRisk) {
    return {
      level: 'urgent',
      score: 96,
      reasons: uniqueReasons([...latestSeverity.reasons, 'eating_disorder_medical_emergency']),
    };
  }
  if (strangulationMedicalRisk) {
    return {
      level: 'urgent',
      score: 97,
      reasons: uniqueReasons([...latestSeverity.reasons, 'strangulation_medical_emergency']),
    };
  }
  if (coerciveDigitalMonitoring) {
    return {
      level: 'urgent',
      score: 94,
      reasons: uniqueReasons([...latestSeverity.reasons, 'coercive_digital_monitoring']),
    };
  }
  if (recentCoerciveDigitalMonitoring) {
    return {
      level: 'urgent',
      score: 92,
      reasons: uniqueReasons([...latestSeverity.reasons, 'recent_coercive_digital_monitoring']),
    };
  }
  if (followDeceasedRisk) {
    return {
      level: 'urgent',
      score: 95,
      reasons: uniqueReasons([...latestSeverity.reasons, 'follow_deceased_self_harm_risk']),
    };
  }
  if (postpartumPsychosisRisk) {
    return {
      level: 'urgent',
      score: 97,
      reasons: uniqueReasons([...latestSeverity.reasons, 'postpartum_psychosis_medical_emergency']),
    };
  }
  if (postpartumIntrusiveHarmThought) {
    return {
      level: 'high',
      score: 76,
      reasons: uniqueReasons([...latestSeverity.reasons.filter((reason) => reason !== 'harm_to_others'), 'postpartum_intrusive_harm_thoughts']),
    };
  }
  if (imminentJumpLocationRisk) {
    return {
      level: 'urgent',
      score: 98,
      reasons: uniqueReasons([...latestSeverity.reasons, 'imminent_jump_location_risk']),
    };
  }
  if (childAbuseCurrentRisk) {
    return {
      level: 'urgent',
      score: 94,
      reasons: uniqueReasons([...latestSeverity.reasons, 'child_abuse_current_risk']),
    };
  }
  if (crisis.isCrisis) return latestSeverity;
  if (harmToOthersPlan) {
    return {
      level: 'urgent',
      score: 97,
      reasons: uniqueReasons([...latestSeverity.reasons, 'harm_to_others_plan']),
    };
  }
  if (stalkingDanger || recentStalkingDanger) {
    return {
      level: 'urgent',
      score: 92,
      reasons: uniqueReasons([...latestSeverity.reasons, 'stalking_or_dating_violence']),
    };
  }
  if (minorSexualExploitation || recentMinorSexualExploitation) {
    return {
      level: 'urgent',
      score: 93,
      reasons: uniqueReasons([...latestSeverity.reasons, 'minor_sexual_exploitation']),
    };
  }
  if (alcoholWithdrawal) {
    return {
      level: 'urgent',
      score: 96,
      reasons: uniqueReasons([...latestSeverity.reasons, 'alcohol_withdrawal_medical_risk']),
    };
  }
  if (minorUnsafe || recentMinorUnsafe) {
    return {
      level: 'urgent',
      score: 93,
      reasons: uniqueReasons([...latestSeverity.reasons, 'minor_without_safe_shelter']),
    };
  }
  if (recentSelfInjuryRisk && selfInjuryMeansAccessible) {
    return {
      level: 'urgent',
      score: 93,
      reasons: uniqueReasons([...latestSeverity.reasons, 'self_injury_means_accessible']),
    };
  }
  if (recentHarmToOthersPlan && harmToOthersFollowUpEscalation) {
    return {
      level: 'urgent',
      score: 94,
      reasons: uniqueReasons([...latestSeverity.reasons, 'harm_to_others_target_access']),
    };
  }
  if (recentSelfInjuryRisk) {
    return {
      level: 'high',
      score: 78,
      reasons: uniqueReasons([...latestSeverity.reasons, 'recent_self_injury_risk']),
    };
  }
  if (dialogueAct?.type === 'acute_violence' || recentAcuteViolence) {
    return {
      level: 'urgent',
      score: 94,
      reasons: uniqueReasons([...latestSeverity.reasons, 'acute_interpersonal_violence']),
    };
  }
  if (recentAlcoholWithdrawal) {
    return {
      level: 'high',
      score: 78,
      reasons: uniqueReasons([...latestSeverity.reasons, 'recent_alcohol_withdrawal_medical_risk']),
    };
  }
  if (recentHarmToOthersPlan) {
    return {
      level: 'high',
      score: 82,
      reasons: uniqueReasons([...latestSeverity.reasons, 'recent_harm_to_others_plan']),
    };
  }
  if (recentCrisis) return { level: 'high', score: 72, reasons: ['recent_crisis_context'] };
  if (dialogueAct?.type === 'passive_death_wish') {
    return {
      level: 'high',
      score: Math.max(latestSeverity.score, 74),
      reasons: uniqueReasons([...latestSeverity.reasons, 'passive_death_wish']),
    };
  }
  if (recentPassiveDeathWish) {
    return {
      level: 'high',
      score: Math.max(latestSeverity.score, 70),
      reasons: uniqueReasons([...latestSeverity.reasons, 'recent_passive_death_wish']),
    };
  }

  const major = sessionProfile.aihubLabels.majorSymptoms.score;
  const risks = sessionProfile.aihubLabels.riskFactors.score;
  if (major >= 3 && risks >= 2) {
    return {
      level: 'high',
      score: Math.max(latestSeverity.score, 72),
      reasons: uniqueReasons([...latestSeverity.reasons, 'cumulative_duration_and_impairment']),
    };
  }

  if (major >= 2 || risks >= 1 || sessionProfile.aihubLabels.interventionFactors.score >= 1) {
    if (latestSeverity.level === 'high') return latestSeverity;
    return {
      level: 'medium',
      score: Math.max(latestSeverity.score, 42),
      reasons: uniqueReasons([...latestSeverity.reasons, 'cumulative_symptom_context']),
    };
  }

  return latestSeverity;
}

function uniqueReasons(reasons) {
  return [...new Set(reasons.filter(Boolean))];
}

function conditionFromHypothesis(profile, key, latestCondition) {
  const hypothesis = profile.hypotheses.find((item) => item.key === key);
  const cumulative = conditionResultFromHypothesisScore(hypothesis?.score ?? 0);
  return cumulative.score >= latestCondition.score ? cumulative : latestCondition;
}

function conditionResultFromHypothesisScore(score) {
  if (score >= 2) return { score: 78, level: 'high' };
  if (score === 1) return { score: 48, level: 'medium' };
  return { score: 12, level: 'low' };
}

function recommendedActions(severityLevel, conditionKey) {
  const base = [
    '오늘의 감정 강도를 0-10점으로 표시하고, 점수가 오른 계기를 기록하세요.',
    '수면, 식사, 음주/충동, 대인관계 변화를 하루 단위로 체크하세요.',
    '증상이 며칠 이상 지속되거나 일상 기능이 떨어지면 전문가 상담을 예약하세요.',
  ];

  if (conditionKey === 'anxiety') {
    base.unshift('호흡을 4초 들이마시고 6초 내쉬는 방식으로 3분간 안정화하세요.');
  } else if (conditionKey === 'depression') {
    base.unshift('오늘 바로 할 수 있는 10분짜리 행동 하나를 정해 실행하세요.');
  } else if (conditionKey === 'addiction') {
    base.unshift('충동이 올라오는 시간, 장소, 감정을 분리해서 기록하고 접근을 줄이세요.');
  }

  if (severityLevel === 'high') {
    base.unshift('가까운 정신건강 전문가 또는 의료기관 상담을 우선 검토하세요.');
  }

  return base;
}

function sessionForMode(mode, conditionKey) {
  const defaults = {
    free: ['상황을 한 문장으로 말하기', '감정 이름 붙이기', '가장 필요한 도움 정하기'],
    emotion: ['몸의 감각 찾기', '감정에 이름 붙이기', '감정이 말하는 욕구 적기'],
    cognitive: ['자동사고 적기', '근거와 반대근거 나누기', '균형 잡힌 문장 만들기'],
    action: ['오늘 가능한 행동 고르기', '장애물 예상하기', '실행 시간을 정하기'],
    crisis: ['주변 위험 낮추기', '연락할 사람 정하기', '전문 도움 연결하기'],
  };

  return {
    title: modeLabels[mode] ?? modeLabels.free,
    focus: conditionKey,
    steps: defaults[mode] ?? defaults.free,
  };
}

function normalizeSession(session, mode) {
  if (!session || !Array.isArray(session.steps)) {
    return sessionForMode(mode, 'general');
  }
  return {
    title: session.title || (modeLabels[mode] ?? modeLabels.free),
    focus: session.focus ?? 'general',
    steps: session.steps,
  };
}

function sanitizeActions(actions = []) {
  return actions.map((action) => sanitizeClinicalLanguage(action));
}

function sanitizeAssistantMessage(message = '', { limitQuestions = true } = {}) {
  const sanitized = sanitizeClinicalLanguage(message);
  return limitQuestions ? limitQuestionCount(sanitized) : sanitized;
}

function limitQuestionCount(message = '') {
  let questionSeen = false;
  const sentences = String(message).match(/[^.!?。！？]+[.!?。！？]?/g);
  if (!sentences) return String(message).trim();

  return sentences
    .filter((sentence) => {
      if (!sentence.includes('?') && !sentence.includes('？')) {
        return true;
      }
      if (questionSeen) {
        return false;
      }
      questionSeen = true;
      return true;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

function summarizeRagAssessment(aihubRagContext) {
  if (aihubRagContext?.skipped) {
    return {
      available: false,
      skipped: true,
      skipReason: aihubRagContext.skipReason ?? 'safety_first',
      matchCount: 0,
      matchedConditions: [],
      topClientLabels: [],
      boundary: '안전 우선 분기에서는 AIHub RAG 유사 사례 검색을 생략합니다.',
    };
  }

  const matches = aihubRagContext?.matches ?? [];
  if (!aihubRagContext?.available || matches.length === 0) {
    return {
      available: false,
      skipped: false,
      error: aihubRagContext?.error ?? null,
      matchCount: 0,
      matchedConditions: [],
      topClientLabels: [],
      boundary: '확정 진단이 아닌 대화 기반 가능성 및 위험도 추정입니다.',
    };
  }

  const labelScores = {};
  for (const match of matches) {
    for (const item of match.topClientLabels ?? []) {
      labelScores[item.label] = Math.max(labelScores[item.label] ?? 0, item.score ?? 0);
    }
  }

  return {
    available: true,
    matchCount: matches.length,
    matchedConditions: publicMatchedConditions(aihubRagContext),
    topClientLabels: Object.entries(labelScores)
      .sort(([aLabel, aScore], [bLabel, bScore]) => bScore - aScore || aLabel.localeCompare(bLabel))
      .slice(0, 8)
      .map(([label, maxScore]) => ({ label, maxScore })),
    boundary: 'AIHub RAG 유사 사례는 확정 진단이 아닌 상태 추정 보조 근거입니다.',
  };
}

function summarizeUserSignals(conditions, severity) {
  return {
    severity: severity.level,
    strongestCondition: strongestCondition(conditions).name,
  };
}

function summarizeDialogueAct(dialogueAct) {
  return {
    type: dialogueAct.type,
    answerKind: dialogueAct.answerKind,
    pendingQuestion: dialogueAct.pendingQuestion
      ? {
          target: dialogueAct.pendingQuestion.target,
          options: dialogueAct.pendingQuestion.options,
        }
      : null,
  };
}

function buildLlmPrompt({ messages, mode, assessment, aihubContext, aihubRagContext, counselorStyleProfile, openai, dialogueAct }) {
  return {
    messages,
    mode,
    assessment,
    aihubContext,
    aihubRagContext,
    responseStyle: buildResponseStyleGuidance(aihubRagContext, counselorStyleProfile),
    dialogueAct: summarizeDialogueAct(dialogueAct),
    model: openai.model,
  };
}
