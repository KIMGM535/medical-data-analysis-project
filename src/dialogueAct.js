import { detectCrisis } from './safety.js';

export function extractPendingQuestion(messages = []) {
  const lastAssistant = [...messages]
    .reverse()
    .find((message) => message.role === 'assistant' && looksLikeQuestion(message.content ?? ''));

  if (!lastAssistant) return null;

  const text = lastQuestionText(lastAssistant.content ?? '');
  const target = questionTarget(text);

  return {
    text,
    target,
    options: questionOptions(text, target),
  };
}

export function classifyDialogueAct({ latestUserText = '', messages = [] } = {}) {
  const text = latestUserText.trim();
  const pendingQuestion = extractPendingQuestion(messages.slice(0, -1));
  const crisis = detectCrisis(text);

  if (crisis.isCrisis) {
    return { type: 'direct_crisis', crisis };
  }

  if (isAcuteViolence(text)) {
    return { type: 'acute_violence', pendingQuestion };
  }

  if (isAiMistrust(text)) {
    return { type: 'ai_mistrust', pendingQuestion };
  }

  if (isBoundaryRefusal(text)) {
    return { type: 'boundary_refusal', pendingQuestion };
  }

  if (isMetaClarification(text)) {
    return { type: 'meta_clarification', pendingQuestion };
  }

  if (isStatusQuestion(text)) {
    return { type: 'status_question', pendingQuestion };
  }

  if (isPassiveDeathWish(text)) {
    return { type: 'passive_death_wish', pendingQuestion };
  }

  if (isHostileRupture(text)) {
    return { type: 'relationship_rupture', pendingQuestion };
  }

  if (isCorrection(text)) {
    return { type: 'correction', pendingQuestion, correctionFocus: correctedFocus(text) };
  }

  if (isUncertainty(text)) {
    return { type: 'avoidance_or_uncertainty', pendingQuestion };
  }

  if (pendingQuestion && isShortAnswer(text)) {
    return {
      type: 'answer_to_pending_question',
      answerKind: 'short_answer',
      pendingQuestion,
    };
  }

  if (pendingQuestion && refersToPendingQuestion(text, pendingQuestion)) {
    return {
      type: 'answer_to_pending_question',
      answerKind: 'elaborated_answer',
      pendingQuestion,
    };
  }

  if (isDeepeningDisclosure(text)) {
    return { type: 'deepening_disclosure', pendingQuestion };
  }

  return { type: 'new_topic', pendingQuestion };
}

function looksLikeQuestion(text) {
  return /[?？]|나요|까요|있나요|있는지|혼자인지|연락할 사람이|무엇인가요|어떤가요|말해줄 수 있나요|뭐였나요|어디에 가깝나요/i.test(text);
}

function lastQuestionText(text) {
  const matches = text.match(/[^.?!。？！]*[?？]/gu);
  return matches?.at(-1)?.trim() || text;
}

function questionTarget(text) {
  if (/잠들려고|잠|누웠|걱정인가요|몸의 긴장|불안인가요/i.test(text)) return 'sleep_trigger';
  if (/기억.*특정 장면|사람이나 말|어떤 사람|어떤 말/i.test(text)) return 'memory_context';
  if (/제일 먼저 든 감정|처음.*감정|처음 들었을 때|소식.*감정/i.test(text)) return 'grief_initial_reaction';
  if (/어디에서 왔|무엇 때문에|왜.*떠올|떠올랐|떠오른/i.test(text)) return 'meaning_clarification';
  if (/몸이나 마음|반응은 무엇|느껴지는 반응/i.test(text)) return 'felt_response';
  if (/슬픔|분노|죄책감|멍함|압박감|지침|무력감/i.test(text)) return 'emotion_choice';
  if (/언제부터|기간|이어졌/i.test(text)) return 'duration';
  if (/하루 생활|일상|관계|영향/i.test(text)) return 'functional_impact';
  if (/덜 혼자|혼자가 아니라|혼자인지|연락할 사람|연락할 수 있는 사람|도움|사람/i.test(text)) return 'support';
  if (/거슬렸|틀렸|잘못/i.test(text)) return 'rupture_feedback';
  return 'open_exploration';
}

function questionOptions(text, target) {
  const options = [];
  for (const option of ['걱정', '몸의 긴장', '불안', '슬픔', '분노', '죄책감', '멍함', '압박감', '지침', '무력감', '공감', '정리', '혼자가 아니라는 느낌']) {
    if (text.includes(option)) options.push(option);
  }

  if (options.length > 0) return options;

  return {
    sleep_trigger: ['걱정', '몸의 긴장', '불안'],
    memory_context: ['장면', '사람', '말'],
    grief_initial_reaction: ['충격', '허망함', '멍함', '비현실감'],
    meaning_clarification: ['계기', '연결된 기억', '떠오른 이유'],
    felt_response: ['몸의 반응', '마음의 반응'],
    emotion_choice: ['슬픔', '분노', '죄책감', '멍함', '압박감', '지침', '무력감'],
    duration: ['시작 시점', '지속 기간'],
    functional_impact: ['일상', '관계', '생활'],
    support: ['사람', '장소', '행동'],
  }[target] ?? [];
}

function isMetaClarification(text) {
  return /묻는\s*건가요|묻는건가요|물어보는\s*건가요|이런\s*걸\s*묻|그걸\s*묻|말하라는\s*건가요|무슨\s*뜻|뭘\s*말하/i.test(text);
}

function isStatusQuestion(text) {
  return /내\s*상태|상태가\s*뭐|뭐라는\s*거|무슨\s*문제|진단|불안장애|우울증|정상인가|정상.*(아니|아닌|맞나)|이상한\s*사람|망가진\s*사람|미친\s*사람/i.test(text);
}

function isAcuteViolence(text) {
  return /(때렸|맞았|폭행|폭력|목을\s*졸|감금|위협|칼로|흉기).{0,18}(방금|지금|아직|같이|집에|옆에|못\s*나가|위험)/i.test(text)
    || /(방금|지금|아직|같이|집에|옆에|못\s*나가|위험).{0,18}(때렸|맞았|폭행|폭력|목을\s*졸|감금|위협|칼로|흉기)/i.test(text);
}

function isAiMistrust(text) {
  return /(AI|인공지능|봇|기계).{0,20}(상담사|뭘\s*알|믿|대체|가짜|모르잖)/i.test(text)
    || /(상담사도\s*아니|네가\s*뭘\s*알|너.*AI|너.*기계|봇이잖)/i.test(text);
}

function isBoundaryRefusal(text) {
  return /(대답|말|설명).{0,8}싫|그만\s*묻|묻지\s*마|그\s*질문.*싫|넘어가|말\s*안\s*할래/i.test(text)
    || /분석하지\s*말|분석\s*말고|그냥\s*(들어|듣)|가만히\s*들어/i.test(text)
    || /(해결책|조언|충고|방법).{0,16}(말고|싫|필요\s*없|하지\s*마).{0,16}(들어|듣|말만)|내\s*말만\s*(들어|듣)/i.test(text);
}

function isPassiveDeathWish(text) {
  return /사라지고\s*싶|없어지고\s*싶|잠들어서\s*안\s*깨|그냥\s*끝났으면|존재.*없었|태어나지\s*말/i.test(text)
    && !/죽고\s*싶|자살|목숨.*끊|해치/i.test(text);
}

function isHostileRupture(text) {
  return /뭔\s*소리|뭔소리|개소리|시발|씨발|좆|꺼져|너\s*같은|내\s*잘못|상담.*못|말.*안\s*통|뻔해|뻔하|와닿지\s*않/i.test(text);
}

function isCorrection(text) {
  return /^(아니|아닌데|그게\s*아니라|정확히는|그 말이 아니라|내 말은)/i.test(text)
    || /그게\s*아니라|그 뜻이 아니/i.test(text);
}

function correctedFocus(text) {
  let cleaned = text.trim();
  for (let i = 0; i < 3; i += 1) {
    const next = cleaned
      .replace(/^(아니요?|아닌데|그게\s*아니라|정확히는|그 말이 아니라|내 말은)[, ]*/i, '')
      .trim();
    if (next === cleaned) break;
    cleaned = next;
  }
  return cleaned || text;
}

function isUncertainty(text) {
  return /모르겠|잘\s*모르|그냥|글쎄|몰라|애매|말로\s*못/i.test(text)
    && !hasConcreteFeeling(text);
}

function hasConcreteFeeling(text) {
  return /압박감|압박|지침|지쳐|지친|힘들|무력감|무기력|불안|긴장|화|분노|슬픔|죄책감|멍함|비현실|두려움|무서움/i.test(text);
}

function isShortAnswer(text) {
  const compact = text.replace(/[^\p{Script=Hangul}A-Za-z0-9]/gu, '');
  return compact.length <= 12 && /^[가-힣A-Za-z0-9]+(요|죠|같아요)?$/i.test(compact);
}

function refersToPendingQuestion(text, pendingQuestion) {
  if (!pendingQuestion) return false;
  return pendingQuestion.options.some((option) => text.includes(option))
    || (pendingQuestion.target === 'duration' && /\d+\s*(일|주|달|개월)|매일|계속|오래/i.test(text))
    || (pendingQuestion.target === 'functional_impact' && /출근|학교|일상|관계|생활|못/i.test(text))
    || (pendingQuestion.target === 'support' && /혼자|연락|동생|친구|가족|곁|사람|같이|있어/i.test(text));
}

function isDeepeningDisclosure(text) {
  return /사실|처음\s*말|아무한테도|어릴\s*때|맞았|때렸|폭력|학대|성폭력|괴롭힘|말한\s*적\s*없/i.test(text)
    || (text.length >= 24 && /죽음|상실|죄책감|수치심|트라우마|기억이\s*계속/i.test(text));
}
