const state = {
  mode: 'free',
  messages: [],
  busy: false,
  insightsVisible: false,
};

const messagesEl = document.querySelector('#messages');
const composer = document.querySelector('#composer');
const input = document.querySelector('#messageInput');
const statusPill = document.querySelector('#statusPill');
const riskValue = document.querySelector('#riskValue');
const safetyMessage = document.querySelector('#safetyMessage');
const conditionGrid = document.querySelector('#conditionGrid');
const actionList = document.querySelector('#actionList');
const sessionTitle = document.querySelector('#sessionTitle');
const stepList = document.querySelector('#stepList');
const evidenceText = document.querySelector('#evidenceText');
const insightPane = document.querySelector('#insightPane');
const insightToggle = document.querySelector('#insightToggle');
const apiBase = getApiBase(window.location);

document.querySelectorAll('.modeButton').forEach((button) => {
  button.addEventListener('click', () => {
    state.mode = button.dataset.mode;
    document.querySelectorAll('.modeButton').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
  });
});

insightToggle.addEventListener('click', () => {
  setInsightsVisible(!state.insightsVisible);
});

composer.addEventListener('submit', async (event) => {
  event.preventDefault();
  const content = input.value.trim();
  if (!content || state.busy) return;

  appendMessage('user', content);
  state.messages.push({ role: 'user', content });
  input.value = '';
  setBusy(true);
  const thinkingMessage = appendMessage('assistant', '잠깐만요. 방금 말을 놓치지 않고 보고 있어요', {
    thinking: true,
  });
  const minimumDelay = getThinkingDelayMs(content);

  try {
    const [result] = await Promise.all([requestCounselingTurn(), wait(minimumDelay)]);
    thinkingMessage.remove();
    appendMessage('assistant', result.assistantMessage);
    state.messages.push({ role: 'assistant', content: result.assistantMessage });
    renderInsights(result);
  } catch (error) {
    thinkingMessage.remove();
    appendMessage('assistant', `요청을 처리하지 못했습니다: ${error.message}`);
  } finally {
    setBusy(false);
    input.focus();
  }
});

input.addEventListener('keydown', (event) => {
  if (!shouldSubmitOnKeydown(event)) return;
  event.preventDefault();
  composer.requestSubmit();
});

setInsightsVisible(state.insightsVisible);
loadStatus();

async function loadStatus() {
  const response = await fetch(`${apiBase}/api/status`);
  const status = await response.json();
  const rawDataset = status.data.rawDataset ?? { available: false };
  const aihubRag = status.data.aihubRag ?? { available: false };
  const counselorStyle = status.data.counselorStyle ?? { available: false };
  statusPill.textContent = status.openaiConfigured ? 'LLM 연결됨' : '데모 모드';
  evidenceText.textContent = [
    `AIHub datasetSn: ${status.data.datasetSn}`,
    `원본 데이터 목록: ${status.data.fileCount}개`,
    `원본 ZIP 접근: ${status.data.rawDatasetAccess}`,
    rawDataset.available
      ? `실제 원천/라벨 데이터: 원천 텍스트 ${rawDataset.sourceTextCount}개, 라벨 JSON ${rawDataset.labelJsonCount}개, 매칭 ${rawDataset.matchedPairCount}쌍`
      : '실제 원천/라벨 데이터: 미연결',
    aihubRag.available
      ? `AIHub RAG 인덱스: 요약형 ${aihubRag.recordCount}건, 원문 비노출 모드`
      : 'AIHub RAG 인덱스: 미연결',
    counselorStyle.available
      ? `실제 상담사 대화 학습: 상담사 발화 ${counselorStyle.counselorTurnCount}개, 질문 비율 ${counselorStyle.questionTurnRatio}`
      : '실제 상담사 대화 학습: 미연결',
    `교육 영상: ${status.data.trainingVideo.url}`,
    `데이터 규모: ${status.data.trainingVideo.datasetHours}시간, ${status.data.trainingVideo.sentenceTokenCountText}`,
    `참고 모델: ${status.data.trainingVideo.models.join(', ')}`,
    `AIHub API key: ${status.aihubConfigured ? '설정됨' : '미설정'}`,
  ].join('\n');
}

async function requestCounselingTurn() {
  const response = await fetch(`${apiBase}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: state.mode,
      messages: state.messages,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || response.statusText);
  }

  return response.json();
}

function appendMessage(role, content, options = {}) {
  const article = document.createElement('article');
  article.className = `message ${role}${options.thinking ? ' thinking' : ''}`;
  article.innerHTML = `
    <span class="speaker">${role === 'user' ? '사용자' : '상담 AI'}</span>
    <p></p>
  `;
  article.querySelector('p').textContent = content;
  messagesEl.append(article);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return article;
}

function renderInsights(result) {
  renderRisk(result);
  renderConditions(result.assessment.conditions);
  renderList(actionList, result.actions);
  sessionTitle.textContent = result.session.title;
  renderList(stepList, result.session.steps);
  const profile = result.assessment.sessionProfile;
  const ragAssessment = result.assessment.aihubRag;
  const report = result.report;
  evidenceText.textContent = [
    profile
      ? [
          `대화 단계: ${profile.phase}`,
          `AIHub 라벨 점수(0-3): 주요 증상 ${profile.aihubLabels.majorSymptoms.score}, 위험 요인 ${profile.aihubLabels.riskFactors.score}, 개선 요인 ${profile.aihubLabels.improvementFactors.score}, 개입 요인 ${profile.aihubLabels.interventionFactors.score}`,
          `현재 가설: ${profile.primaryHypothesis.label} (${formatConfidenceLabel(profile.primaryHypothesis.confidence)})`,
          ragAssessment?.available
            ? `RAG 보조 근거: 유사 요약 사례 ${ragAssessment.matchCount}건, ${formatRagConditionSummary(ragAssessment.matchedConditions)}`
            : 'RAG 보조 근거: 일치 요약 사례 없음',
          '',
        ].join('\n')
      : '',
    report
      ? [...formatReportSummaryLines(report), ''].join('\n')
      : '',
    result.evidence.aihubContext,
    result.evidence.aihubRagContext?.contextText ? `\n${result.evidence.aihubRagContext.contextText}` : '',
    '',
    result.evidence.modelGuidance,
    '',
    `응답 소스: ${result.source}`,
    `임상 경계: ${result.assessment.clinicalBoundary}`,
  ].join('\n');
}

function renderRisk(result) {
  const level = result.assessment.severity.level;
  const labels = { low: '낮음', medium: '중간', high: '높음', urgent: '긴급' };
  riskValue.className = `riskValue ${level}`;
  riskValue.textContent = labels[level] || level;
  safetyMessage.textContent = result.safety.message;
}

function renderConditions(conditions) {
  const labels = {
    depression: '우울',
    anxiety: '불안',
    addiction: '중독',
    general: '일반군',
  };
  conditionGrid.innerHTML = '';
  Object.entries(labels).forEach(([key, label]) => {
    const item = conditions[key];
    const row = document.createElement('div');
    row.className = 'conditionItem';
    row.innerHTML = `
      <span>${label}</span>
      <div class="bar"><span style="width: ${Math.min(item.score, 100)}%"></span></div>
      <strong>${levelLabel(item.level)}</strong>
    `;
    conditionGrid.append(row);
  });
}

function renderList(element, items) {
  element.innerHTML = '';
  items.forEach((item) => {
    const li = document.createElement('li');
    li.textContent = item;
    element.append(li);
  });
}

function levelLabel(level) {
  return { low: '낮음', medium: '중간', high: '높음', urgent: '긴급' }[level] || level;
}

function setBusy(nextBusy) {
  state.busy = nextBusy;
  composer.querySelector('button').disabled = nextBusy;
  composer.querySelector('button').textContent = nextBusy ? '읽는 중' : '보내기';
}

function setInsightsVisible(isVisible) {
  state.insightsVisible = isVisible;
  insightPane.hidden = !isVisible;
  document.body.classList.toggle('insightsHidden', !isVisible);
  insightToggle.textContent = getInsightToggleLabel(isVisible);
  insightToggle.setAttribute('aria-expanded', String(isVisible));
}

function shouldSubmitOnKeydown(event) {
  return event.key === 'Enter' && !event.shiftKey && !event.isComposing;
}

function getThinkingDelayMs(text = '') {
  if (/죽고\s*싶|자살|수면제.*(몇|죽|치사량)|약.*(몇|죽|치사량|과다복용)/i.test(text)) {
    return 900;
  }

  const normalizedLength = text.trim().length;
  return Math.min(3200, 1300 + Math.floor(normalizedLength / 18) * 240);
}

function getInsightToggleLabel(isVisible) {
  return isVisible ? '분석 숨김' : '분석 보기';
}

function getApiBase(locationLike = window.location) {
  return locationLike?.protocol === 'file:' ? 'http://127.0.0.1:5173' : '';
}

function formatRagConditionSummary(matchedConditions) {
  if (!Array.isArray(matchedConditions) || matchedConditions.length === 0) {
    return '조건 분포 없음';
  }

  return matchedConditions.map((item) => `${item.label ?? ragConditionLabel(item.condition)} ${item.count}건`).join(', ');
}

function formatConfidenceLabel(confidence) {
  return {
    tentative: '초기 가설',
    moderate: '누적 근거 있음',
    strong: '강한 누적 근거',
  }[confidence] ?? '추정 중';
}

function formatReportSummaryLines(report) {
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

function wait(ms) {
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
