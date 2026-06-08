export function shouldSubmitOnKeydown(event) {
  return event.key === 'Enter' && !event.shiftKey && !event.isComposing;
}

export function getThinkingDelayMs(text = '') {
  if (/죽고\s*싶|자살|수면제.*(몇|죽|치사량)|약.*(몇|죽|치사량|과다복용)/i.test(text)) {
    return 900;
  }

  const normalizedLength = text.trim().length;
  return Math.min(3200, 1300 + Math.floor(normalizedLength / 18) * 240);
}

export function getInsightToggleLabel(isVisible) {
  return isVisible ? '분석 숨김' : '분석 보기';
}

export function getApiBase(locationLike = globalThis.location) {
  return locationLike?.protocol === 'file:' ? 'http://127.0.0.1:5173' : '';
}

export function formatRagConditionSummary(matchedConditions) {
  if (!Array.isArray(matchedConditions) || matchedConditions.length === 0) {
    return '조건 분포 없음';
  }

  return matchedConditions.map((item) => `${item.label ?? ragConditionLabel(item.condition)} ${item.count}건`).join(', ');
}

export function formatConfidenceLabel(confidence) {
  return {
    tentative: '초기 가설',
    moderate: '누적 근거 있음',
    strong: '강한 누적 근거',
  }[confidence] ?? '추정 중';
}

export function formatReportSummaryLines(report) {
  if (!report) return [];
  const hypothesisText = report.display?.currentHypothesisText
    ?? `${report.currentHypothesis?.label ?? '상태'} (${formatConfidenceLabel(report.currentHypothesis?.confidence)})`;
  const intensityText = report.display?.intensityText ?? `강도 ${report.intensity?.level ?? '추정 중'}`;
  const lines = [
    `상담 요약 보고서: ${hypothesisText}, ${intensityText}`,
  ];

  if (report.userSummary?.text) {
    lines.push(`사용자용 요약: ${report.userSummary.text}`);
  }
  if (report.userSummary?.resourceText) {
    lines.push(`도움 신호: ${report.userSummary.resourceText}`);
  }
  if (report.userSummary?.nextStepText) {
    lines.push(`다음 초점: ${report.userSummary.nextStepText}`);
  }
  if (report.counselorReview) {
    lines.push(
      `상담자 검토: 단계 ${report.counselorReview.phase ?? report.phase ?? 'unknown'}, RAG ${report.counselorReview.ragSupportText ?? '없음'}`,
    );
    if (report.counselorReview.protectiveFactorSummary) {
      lines.push(report.counselorReview.protectiveFactorSummary);
    }
    lines.push(`AIHub 라벨: ${report.counselorReview.aihubLabelSummary ?? 'AIHub 라벨 점수 없음'}`);
  }
  lines.push(`요약 기준: 사용자 발화 ${report.userTurnCount ?? 0}개, ${report.boundary ?? '대화 기반 임시 정리입니다.'}`);

  return lines;
}

export function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function ragConditionLabel(condition) {
  return {
    ANXIETY: '불안 관련',
    DEPRESSION: '우울 관련',
    ADDICTION: '중독/충동 관련',
    NORMAL: '일반 스트레스 관련',
    UNKNOWN: '기타 관련',
  }[condition] ?? '기타 관련';
}
