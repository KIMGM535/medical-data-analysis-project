import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyDialogueAct,
  extractPendingQuestion,
} from '../src/dialogueAct.js';

test('extractPendingQuestion remembers the assistant question target', () => {
  const pending = extractPendingQuestion([
    {
      role: 'assistant',
      content:
        '잠들려고 누웠을 때 제일 먼저 올라오는 건 걱정인가요, 몸의 긴장인가요, 아니면 이유 없이 밀려오는 불안인가요?',
    },
  ]);

  assert.equal(pending?.target, 'sleep_trigger');
  assert.ok(pending.options.includes('걱정'));
  assert.ok(pending.options.includes('몸의 긴장'));
  assert.ok(pending.options.includes('불안'));
});

test('classifyDialogueAct treats a short noun as answer to pending question', () => {
  const act = classifyDialogueAct({
    latestUserText: '기억이요',
    messages: [
      {
        role: 'assistant',
        content:
          '잠들려고 누웠을 때 제일 먼저 올라오는 건 걱정인가요, 몸의 긴장인가요, 아니면 이유 없이 밀려오는 불안인가요?',
      },
      { role: 'user', content: '기억이요' },
    ],
  });

  assert.equal(act.type, 'answer_to_pending_question');
  assert.equal(act.answerKind, 'short_answer');
  assert.equal(act.pendingQuestion.target, 'sleep_trigger');
});

test('classifyDialogueAct recognizes corrections and relationship ruptures', () => {
  const correction = classifyDialogueAct({
    latestUserText: '아니 그게 아니라 엄마 생각이 나서 그래요',
    messages: [{ role: 'assistant', content: '불안이 올라오는군요?' }],
  });

  assert.equal(correction.type, 'correction');
  assert.equal(correction.correctionFocus, '엄마 생각이 나서 그래요');

  const rupture = classifyDialogueAct({
    latestUserText: '너 지금 뭔소리야 시발',
    messages: [{ role: 'assistant', content: '안전 확인을 먼저 할게요.' }],
  });

  assert.equal(rupture.type, 'relationship_rupture');
});

test('classifyDialogueAct distinguishes uncertainty from crisis', () => {
  const uncertain = classifyDialogueAct({
    latestUserText: '잘 모르겠어요 그냥요',
    messages: [{ role: 'assistant', content: '가장 먼저 느껴지는 반응은 무엇인가요?' }],
  });

  assert.equal(uncertain.type, 'avoidance_or_uncertainty');

  const crisis = classifyDialogueAct({
    latestUserText: '나 지금 죽고 싶어',
    messages: [{ role: 'assistant', content: '무슨 일이 있었나요?' }],
  });

  assert.equal(crisis.type, 'direct_crisis');
});

test('classifyDialogueAct recognizes a question about the assistant question itself', () => {
  const act = classifyDialogueAct({
    latestUserText: '무엇 때문에 떠올랐냐. 이런 걸 묻는건가요?',
    messages: [
      {
        role: 'assistant',
        content: '그 소식을 처음 들었을 때 제일 먼저 든 감정은 뭐였나요?',
      },
      { role: 'user', content: '비현실적이었어요.' },
      {
        role: 'assistant',
        content: '그 비현실적인 느낌이 어디에서 왔는지 천천히 볼까요?',
      },
      { role: 'user', content: '무엇 때문에 떠올랐냐. 이런 걸 묻는건가요?' },
    ],
  });

  assert.equal(act.type, 'meta_clarification');
  assert.equal(act.pendingQuestion.target, 'meaning_clarification');
});

test('classifyDialogueAct recognizes direct status questions instead of pending answers', () => {
  const act = classifyDialogueAct({
    latestUserText: '그럼 내 상태가 뭐라는 거예요?',
    messages: [
      {
        role: 'assistant',
        content: '그 비현실적인 느낌은 소식을 들은 장면에서 강했나요, 아니면 혼자 있을 때 더 크게 왔나요?',
      },
      { role: 'user', content: '그럼 내 상태가 뭐라는 거예요?' },
    ],
  });

  assert.equal(act.type, 'status_question');

  const normalityAct = classifyDialogueAct({
    latestUserText: '나는 이제 정상은 아닌 거죠?',
    messages: [
      {
        role: 'assistant',
        content: '지금 이 이야기를 하면서 가장 필요한 건 멈춰도 된다는 느낌인가요?',
      },
      { role: 'user', content: '나는 이제 정상은 아닌 거죠?' },
    ],
  });

  assert.equal(normalityAct.type, 'status_question');
});

test('extractPendingQuestion uses the last question instead of the whole assistant paragraph', () => {
  const pending = extractPendingQuestion([
    {
      role: 'assistant',
      content:
        '기억이요라고 답해준 게 중요하게 들립니다. 밤에 누웠을 때 단순한 걱정보다 어떤 기억이 먼저 떠오르는 것 같아요. 그 기억은 특정 장면에 가깝나요, 아니면 어떤 사람이나 말에 더 가깝나요?',
    },
  ]);

  assert.equal(pending.target, 'memory_context');
});

test('classifyDialogueAct treats passive death wish as safety-relevant, not uncertainty', () => {
  const act = classifyDialogueAct({
    latestUserText: '그냥 사라지고 싶다는 생각이 자꾸 들어요. 죽겠다는 건 아닌데요.',
    messages: [
      { role: 'assistant', content: '그 이야기를 떠올리면 몸이나 마음에서 가장 먼저 느껴지는 반응은 무엇인가요?' },
      { role: 'user', content: '그냥 사라지고 싶다는 생각이 자꾸 들어요. 죽겠다는 건 아닌데요.' },
    ],
  });

  assert.equal(act.type, 'passive_death_wish');
});

test('classifyDialogueAct treats support replies as answers to the safety question', () => {
  const act = classifyDialogueAct({
    latestUserText: '혼자는 아니고 동생한테 연락할 수 있어요.',
    messages: [
      {
        role: 'assistant',
        content: '지금 혼자 있나요, 아니면 바로 곁에 있거나 연락할 수 있는 사람이 있나요?',
      },
      { role: 'user', content: '혼자는 아니고 동생한테 연락할 수 있어요.' },
    ],
  });

  assert.equal(act.type, 'answer_to_pending_question');
  assert.equal(act.pendingQuestion.target, 'support');
});

test('classifyDialogueAct recognizes refusal and AI-role mistrust as process turns', () => {
  const refusal = classifyDialogueAct({
    latestUserText: '대답하기 싫어요.',
    messages: [
      { role: 'assistant', content: '그 감정은 몸에서 먼저 느껴지나요, 생각으로 먼저 떠오르나요?' },
      { role: 'user', content: '대답하기 싫어요.' },
    ],
  });

  assert.equal(refusal.type, 'boundary_refusal');

  const mistrust = classifyDialogueAct({
    latestUserText: '너 AI잖아. 상담사도 아니면서 뭘 알아.',
    messages: [
      { role: 'assistant', content: '그 이야기를 조금 더 들어보고 싶어요.' },
      { role: 'user', content: '너 AI잖아. 상담사도 아니면서 뭘 알아.' },
    ],
  });

  assert.equal(mistrust.type, 'ai_mistrust');
});

test('classifyDialogueAct recognizes advice refusal as a listen-only boundary', () => {
  const act = classifyDialogueAct({
    latestUserText: '해결책 말고 내 말만 들어줘요.',
    messages: [
      { role: 'assistant', content: '오늘 바로 할 수 있는 방법을 같이 정해볼까요?' },
      { role: 'user', content: '해결책 말고 내 말만 들어줘요.' },
    ],
  });

  assert.equal(act.type, 'boundary_refusal');
});

test('classifyDialogueAct treats a concrete pressure feeling as an answer despite 그냥', () => {
  const act = classifyDialogueAct({
    latestUserText: '그냥 압박감이 너무 심해요.',
    messages: [
      {
        role: 'assistant',
        content: '회사에서 버티기 힘들 때 가장 가까운 건 압박감인가요, 지침인가요, 아니면 무력감인가요?',
      },
      { role: 'user', content: '그냥 압박감이 너무 심해요.' },
    ],
  });

  assert.equal(act.type, 'answer_to_pending_question');
  assert.equal(act.pendingQuestion.target, 'emotion_choice');
});
