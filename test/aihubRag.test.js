import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadAihubInventory } from '../src/knowledge.js';
import { createCounselingTurn } from '../src/counselor.js';
import {
  buildAihubRagContext,
  loadDeployableAihubRagIndex,
  loadAihubRagIndex,
  toDeployableAihubRagIndex,
  validateDeployableAihubRagIndex,
} from '../src/aihubRag.js';

test('loadAihubRagIndex builds a privacy-limited searchable case index', () => {
  const root = makeRagFixture();

  const index = loadAihubRagIndex(root);

  assert.equal(index.available, true);
  assert.equal(index.recordCount, 1);
  assert.equal(index.privacyMode, 'summary_only');
  assert.equal(index.records[0].condition, 'ANXIETY');
  assert.deepEqual(index.records[0].diagnosisScores, { depression: 0, anxiety: 2, addiction: 0 });
  assert.equal(index.records[0].sourceSignals.anxiety, 1);
  assert.equal(index.records[0].sourceSignals.sleep_disturbance, 1);
  assert.ok(index.records[0].topClientLabels.some((item) => item.label === 'sleep_disturbance'));
  assert.ok(index.records[0].topCounselorInterventions.some((item) => item.label === 'clarification_reflection'));
  assert.doesNotMatch(index.records[0].safeSummary, /상담사\s*:/);
  assert.doesNotMatch(index.records[0].safeSummary, /내담자\s*:/);
  assert.doesNotMatch(index.records[0].safeSummary, /회사에서 심장이 뛰어요/);
  assert.doesNotMatch(JSON.stringify(index.records[0].sourceSignals), /회사에서 심장이 뛰어요/);
});

test('toDeployableAihubRagIndex removes case identifiers and keeps only derived searchable fields', () => {
  const root = makeRagFixture();
  const index = loadAihubRagIndex(root);

  const deployable = toDeployableAihubRagIndex(index, { createdAt: '2026-06-03T00:00:00.000Z' });

  assert.equal(deployable.kind, 'aihub_71806_deployable_rag_index');
  assert.equal(deployable.privacyMode, 'deployable_summary_only');
  assert.equal(deployable.createdAt, '2026-06-03T00:00:00.000Z');
  assert.equal(deployable.records.length, 1);
  assert.deepEqual(Object.keys(deployable.records[0]).sort(), [
    'condition',
    'diagnosisScores',
    'diagnosisStrength',
    'safeSummary',
    'searchText',
    'sourceSignals',
    'topClientLabels',
    'topCounselorInterventions',
  ]);
  assert.equal(deployable.records[0].condition, 'ANXIETY');
  assert.equal(deployable.records[0].sourceSignals.anxiety, 1);
  assert.doesNotMatch(JSON.stringify(deployable), /caseKey|hasSourceText|root|resource_|label_|\.txt|\.json/);
  assert.doesNotMatch(JSON.stringify(deployable), /내담자\s*:|상담사\s*:|회사에서 심장이 뛰어요/);
});

test('validateDeployableAihubRagIndex rejects raw paths, filenames, speaker prefixes, and case identifiers', () => {
  const valid = toDeployableAihubRagIndex(loadAihubRagIndex(makeRagFixture()), {
    createdAt: '2026-06-03T00:00:00.000Z',
  });
  const invalid = {
    ...valid,
    records: [
      {
        ...valid.records[0],
        caseKey: 'anxiety_1_check_A001',
        safeSummary: '내담자 : 회사에서 심장이 뛰어요.',
        searchText: '/tmp/resource_anxiety_1_check_A001.txt label_anxiety_1_check_A001.json',
      },
    ],
  };

  assert.deepEqual(validateDeployableAihubRagIndex(valid), {
    ok: true,
    issueCount: 0,
    issues: [],
  });

  const validation = validateDeployableAihubRagIndex(invalid);

  assert.equal(validation.ok, false);
  assert.ok(validation.issueCount >= 4);
  assert.ok(validation.issues.some((issue) => issue.reason === 'forbidden_record_field'));
  assert.ok(validation.issues.some((issue) => issue.reason === 'speaker_prefix_leak'));
  assert.ok(validation.issues.some((issue) => issue.reason === 'raw_filename_or_path_leak'));
});

test('loadDeployableAihubRagIndex loads a deployable index without raw data access', () => {
  const root = makeRagFixture();
  const exportPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aihub-rag-export-')), 'deployable-rag.json');
  const deployable = toDeployableAihubRagIndex(loadAihubRagIndex(root), {
    createdAt: '2026-06-03T00:00:00.000Z',
  });
  fs.writeFileSync(exportPath, JSON.stringify(deployable, null, 2));

  const loaded = loadDeployableAihubRagIndex(exportPath);
  const context = buildAihubRagContext(loaded, {
    messages: [{ role: 'user', content: '요즘 잠을 못 자고 불안해서 누우면 계속 깨어 있어요.' }],
  });

  assert.equal(loaded.available, true);
  assert.equal(loaded.privacyMode, 'deployable_summary_only');
  assert.equal(loaded.recordCount, 1);
  assert.equal(loaded.sourceTextCount, 0);
  assert.equal(loaded.sourceMatchedRecordCount, 0);
  assert.equal(context.available, true);
  assert.equal(context.matches[0].condition, 'ANXIETY');
  assert.doesNotMatch(JSON.stringify(loaded), /root|caseKey|hasSourceText|resource_|label_|\.txt|\.json/);
});

test('loadDeployableAihubRagIndex fails closed when the deployable file leaks raw identifiers', () => {
  const exportPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aihub-rag-export-invalid-')), 'deployable-rag.json');
  fs.writeFileSync(
    exportPath,
    JSON.stringify({
      kind: 'aihub_71806_deployable_rag_index',
      privacyMode: 'deployable_summary_only',
      records: [
        {
          condition: 'ANXIETY',
          caseKey: 'anxiety_1_check_A001',
          diagnosisScores: { depression: 0, anxiety: 2, addiction: 0 },
          diagnosisStrength: 2,
          topClientLabels: [],
          topCounselorInterventions: [],
          sourceSignals: {},
          safeSummary: '내담자 : 불안해요.',
          searchText: 'resource_anxiety_1_check_A001.txt',
        },
      ],
    }),
  );

  const loaded = loadDeployableAihubRagIndex(exportPath);

  assert.equal(loaded.available, false);
  assert.equal(loaded.error, 'deployable_rag_validation_failed');
  assert.ok(loaded.validation.issueCount >= 1);
  assert.deepEqual(loaded.records, []);
});

test('buildAihubRagContext retrieves relevant AIHub cases without exposing raw transcript text', () => {
  const root = makeRagFixture();
  const index = loadAihubRagIndex(root);

  const context = buildAihubRagContext(index, {
    messages: [{ role: 'user', content: '요즘 잠을 못 자고 불안해서 누우면 계속 깨어 있어요.' }],
  });

  assert.equal(context.available, true);
  assert.equal(context.matches.length, 1);
  assert.equal(context.matches[0].condition, 'ANXIETY');
  assert.match(context.contextText, /AIHub RAG 검색 근거/);
  assert.match(context.contextText, /ANXIETY/);
  assert.match(context.contextText, /sleep_disturbance/);
  assert.match(context.contextText, /clarification_reflection/);
  assert.doesNotMatch(context.contextText, /상담사\s*:/);
  assert.doesNotMatch(context.contextText, /내담자\s*:/);
  assert.doesNotMatch(context.contextText, /회사에서 심장이 뛰어요/);
});

test('buildAihubRagContext diversifies ambiguous sleep-only matches across conditions', () => {
  const index = {
    available: true,
    privacyMode: 'summary_only',
    records: [
      makeRagRecord({ condition: 'DEPRESSION', diagnosisScores: { depression: 3, anxiety: 0, addiction: 0 } }),
      makeRagRecord({ condition: 'DEPRESSION', diagnosisScores: { depression: 3, anxiety: 0, addiction: 0 } }),
      makeRagRecord({ condition: 'DEPRESSION', diagnosisScores: { depression: 2, anxiety: 0, addiction: 0 } }),
      makeRagRecord({ condition: 'ANXIETY', diagnosisScores: { depression: 0, anxiety: 2, addiction: 0 } }),
    ],
  };

  const context = buildAihubRagContext(index, {
    messages: [{ role: 'user', content: '요즘 잠을 잘 못 자요.' }],
    limit: 3,
  });

  assert.equal(context.matches.length, 3);
  assert.ok(context.matches.some((match) => match.condition === 'ANXIETY'));
});

test('buildAihubRagContext treats another person suicide news as grief, not user self-harm', () => {
  const index = {
    available: true,
    privacyMode: 'summary_only',
    records: [
      makeRagRecord({
        condition: 'ADDICTION',
        diagnosisScores: { depression: 0, anxiety: 0, addiction: 3 },
        topClientLabels: [{ label: 'self_harm', score: 3 }],
        sourceSignals: { self_harm: 3 },
        safeSummary: '자해 충동과 충동 조절 어려움 요약.',
        searchText: 'ADDICTION self_harm suicidal_accident 자살 죽고 싶 충동',
      }),
      makeRagRecord({
        condition: 'DEPRESSION',
        diagnosisScores: { depression: 2, anxiety: 0, addiction: 0 },
        topClientLabels: [{ label: 'stressful_event', score: 3 }],
        sourceSignals: { grief: 2, stressful_event: 2 },
        safeSummary: '상실 소식을 듣고 충격과 비현실감을 말한 애도 요약.',
        searchText: 'DEPRESSION grief stressful_event 친구 자살 소식 상실 비현실 애도',
      }),
    ],
  };

  const context = buildAihubRagContext(index, {
    messages: [{ role: 'user', content: '친구가 자살했다는 소식을 들었어요.' }],
    limit: 1,
  });

  assert.deepEqual(context.queryFeatures, ['stressful_event', 'grief']);
  assert.equal(context.matches[0].condition, 'DEPRESSION');
  assert.match(context.matches[0].safeSummary, /상실|애도/);
});

test('buildAihubRagContext detects trauma disclosures without exposing raw content', () => {
  const index = {
    available: true,
    privacyMode: 'summary_only',
    records: [
      makeRagRecord({
        condition: 'ANXIETY',
        diagnosisScores: { depression: 0, anxiety: 2, addiction: 0 },
        topClientLabels: [{ label: 'stressful_event', score: 3 }],
        sourceSignals: { trauma: 2, stressful_event: 2 },
        safeSummary: '침투 기억과 긴장 반응을 다룬 트라우마 요약.',
        searchText: 'ANXIETY trauma stressful_event 성폭행 기억 침투 반응',
      }),
      makeRagRecord({
        condition: 'DEPRESSION',
        diagnosisScores: { depression: 2, anxiety: 0, addiction: 0 },
        topClientLabels: [{ label: 'sleep_disturbance', score: 2 }],
        sourceSignals: { sleep_disturbance: 2 },
        safeSummary: '수면 어려움 요약.',
        searchText: 'DEPRESSION sleep_disturbance 잠 불면',
      }),
    ],
  };

  const context = buildAihubRagContext(index, {
    messages: [{ role: 'user', content: '성폭행 당했던 기억이 자꾸 떠올라요.' }],
    limit: 1,
  });

  assert.deepEqual(context.queryFeatures, ['trauma']);
  assert.equal(context.matches[0].condition, 'ANXIETY');
  assert.match(context.matches[0].safeSummary, /트라우마/);
  assert.doesNotMatch(context.contextText, /내담자\s*:|상담사\s*:/);
});

test('buildAihubRagContext keeps trauma context across several follow-up turns', () => {
  const index = {
    available: true,
    privacyMode: 'summary_only',
    records: [
      makeRagRecord({
        condition: 'ANXIETY',
        diagnosisScores: { depression: 0, anxiety: 2, addiction: 0 },
        topClientLabels: [{ label: 'stressful_event', score: 3 }],
        sourceSignals: { trauma: 3, stressful_event: 2 },
        safeSummary: '트라우마 반응과 자기낙인을 다룬 요약.',
        searchText: 'ANXIETY trauma stressful_event 성폭행 트라우마 자기낙인',
      }),
      makeRagRecord({
        condition: 'DEPRESSION',
        diagnosisScores: { depression: 3, anxiety: 0, addiction: 0 },
        topClientLabels: [{ label: 'depression', score: 3 }],
        sourceSignals: { depression: 3 },
        safeSummary: '우울감과 무기력 요약.',
        searchText: 'DEPRESSION depression 우울 무기력 정상',
      }),
    ],
  };

  const context = buildAihubRagContext(index, {
    messages: [
      { role: 'user', content: '말하기 싫은데 성폭행 당했던 기억이 자꾸 떠올라요.' },
      { role: 'assistant', content: '자세히 말하지 않아도 됩니다.' },
      { role: 'user', content: '내가 잘못한 것 같아요.' },
      { role: 'assistant', content: '그 일이 네 잘못이라는 뜻은 아닙니다.' },
      { role: 'user', content: '그런 말도 다 뻔해요.' },
      { role: 'assistant', content: '상투적으로 들린 점부터 보겠습니다.' },
      { role: 'user', content: '나 이제 망가진 사람인가요?' },
      { role: 'assistant', content: '나는 당신을 망가진 사람으로 보지 않겠습니다.' },
      { role: 'user', content: '나는 이제 정상은 아닌 거죠?' },
    ],
    limit: 1,
  });

  assert.ok(context.queryFeatures.includes('trauma'));
  assert.equal(context.matches[0].condition, 'ANXIETY');
  assert.match(context.matches[0].safeSummary, /트라우마/);
  assert.doesNotMatch(context.contextText, /성폭행 당했던 기억|내담자\s*:|상담사\s*:/);
});

test('buildAihubRagContext falls back safely when the index is absent or empty', () => {
  const index = loadAihubRagIndex(path.join(os.tmpdir(), 'missing-aihub-rag-root'));

  const context = buildAihubRagContext(index, {
    messages: [{ role: 'user', content: '불안하고 잠을 못 자요.' }],
  });

  assert.equal(index.available, false);
  assert.equal(context.available, false);
  assert.deepEqual(context.matches, []);
  assert.match(context.contextText, /AIHub RAG 인덱스가 아직 로드되지 않았습니다/);
});

function makeRagRecord({
  condition,
  diagnosisScores,
  topClientLabels = [{ label: 'sleep_disturbance', score: 3 }],
  topCounselorInterventions = [{ label: 'clarification_reflection', score: 2 }],
  sourceSignals = { sleep_disturbance: 2 },
  safeSummary = '수면 어려움 요약.',
  searchText = `${condition} sleep_disturbance 수면 잠 불면`,
}) {
  return {
    condition,
    diagnosisScores,
    diagnosisStrength: Math.max(...Object.values(diagnosisScores)),
    topClientLabels,
    topCounselorInterventions,
    sourceSignals,
    safeSummary,
    searchText,
    hasSourceText: true,
  };
}

test('loadAihubRagIndex redacts common Korean personal data from label summaries', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aihub-rag-pii-'));
  const sourceDir = path.join(root, 'Training', '01.원천데이터', 'TS_001._우울증_0001._1회기');
  const labelDir = path.join(root, 'Training', '02.라벨링데이터', 'TL_001._우울증_0001._1회기');
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.mkdirSync(labelDir, { recursive: true });
  fs.writeFileSync(path.join(sourceDir, 'resource_depression_1_check_D001.txt'), '내담자 : 우울해요\n');
  fs.writeFileSync(
    path.join(labelDir, 'label_depression_1_check_D001.json'),
    JSON.stringify({
      filename: 'label_depression_1_check_D001',
      id: 'D001',
      class: 'DEPRESSION',
      depression: 2,
      anxiety: 0,
      addiction: 0,
      summary:
        '내담자명 김민수는 서울시 강남구 역삼동에 살며 한국대학교와 민수회사 이야기를 했다. 카카오ID minsu123, 계좌 123-456-789012도 언급했다.',
      paragraph: [],
    }),
  );

  const index = loadAihubRagIndex(root);
  const summary = index.records[0].safeSummary;

  assert.doesNotMatch(summary, /김민수|서울시|강남구|역삼동|한국대학교|민수회사|minsu123|123-456-789012/);
  assert.match(summary, /\[이름\]|\[주소\]|\[학교\]|\[직장\]|\[카카오ID\]|\[계좌\]/);
});

test('loadAihubRagIndex redacts honorific Korean names from free-form summaries', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aihub-rag-name-'));
  const sourceDir = path.join(root, 'Training', '01.원천데이터', 'TS_001._우울증_0002._1회기');
  const labelDir = path.join(root, 'Training', '02.라벨링데이터', 'TL_001._우울증_0002._1회기');
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.mkdirSync(labelDir, { recursive: true });
  fs.writeFileSync(path.join(sourceDir, 'resource_depression_1_check_D002.txt'), '내담자 : 우울해요\n');
  fs.writeFileSync(
    path.join(labelDir, 'label_depression_1_check_D002.json'),
    JSON.stringify({
      filename: 'label_depression_1_check_D002',
      id: 'D002',
      class: 'DEPRESSION',
      depression: 2,
      anxiety: 0,
      addiction: 0,
      summary: '김민수 씨는 최근 무기력과 수면 문제를 이야기했고, 상담사는 민수님에게 감정을 반영했다.',
      paragraph: [],
    }),
  );

  const index = loadAihubRagIndex(root);
  const summary = index.records[0].safeSummary;

  assert.doesNotMatch(summary, /김민수|민수님|김민수 씨/);
  assert.match(summary, /\[이름\]/);
});

test('loadAihubRagIndex recovers top-level labels from non-standard JSON files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aihub-rag-invalid-'));
  const sourceDir = path.join(root, 'Validation', '01.원천데이터', 'VS_001._우울증_0001._1회기');
  const labelDir = path.join(root, 'Validation', '02.라벨링데이터', 'VL_001._우울증_0001._1회기');
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.mkdirSync(labelDir, { recursive: true });
  fs.writeFileSync(path.join(sourceDir, 'resource_depression_1_check_D001.txt'), '내담자 : 아무것도 하기 싫어요\n');
  fs.writeFileSync(
    path.join(labelDir, 'label_depression_1_check_D001.json'),
    `{
      "filename": "label_depression_1_check_D001",
      "id": "D001",
      "depression": 2,
      "anxiety": 0,
      "addiction": 0,
      "class": "DEPRESSION",
      "summary": 주요증상: 무기력,
      "paragraph": [{"cps": Infinity}]
    }`,
  );

  const index = loadAihubRagIndex(root);

  assert.equal(index.recordCount, 1);
  assert.equal(index.invalidLabelJsonCount, 0);
  assert.equal(index.records[0].condition, 'DEPRESSION');
  assert.equal(index.records[0].diagnosisScores.depression, 2);
});

test('createCounselingTurn passes RAG context to the LLM prompt and evidence bundle', async () => {
  let observedPrompt = null;
  const ragContext = {
    available: true,
    privacyMode: 'summary_only',
    matches: [
      {
        condition: 'ANXIETY',
        score: 12,
        safeSummary: '불안과 수면 어려움이 함께 나타난 사례 요약.',
        topClientLabels: [{ label: 'sleep_disturbance', score: 2 }],
        topCounselorInterventions: [{ label: 'clarification_reflection', score: 2 }],
      },
    ],
    contextText: 'AIHub RAG 검색 근거: ANXIETY, sleep_disturbance, clarification_reflection',
  };

  const result = await createCounselingTurn({
    messages: [{ role: 'user', content: '요즘 불안하고 잠을 잘 못 자요.' }],
    inventory: loadAihubInventory(),
    aihubRagContext: ragContext,
    allowPrivateRagInLlmPrompt: true,
    llmClient: async (prompt) => {
      observedPrompt = prompt;
      return {
        assistantMessage: '잠을 못 자고 불안한 시간이 이어져서 많이 지쳤겠어요.',
        actions: ['오늘 밤 올라오는 생각을 한 문장으로 적어봅니다.'],
        session: { title: '불안 탐색', focus: 'anxiety', steps: ['감정 반영'] },
      };
    },
  });

  assert.equal(observedPrompt.aihubRagContext.contextText, ragContext.contextText);
  assert.notEqual(result.evidence.aihubRagContext.contextText, ragContext.contextText);
  assert.match(result.evidence.aihubRagContext.contextText, /유사 요약 사례 1건/);
  assert.doesNotMatch(result.evidence.aihubRagContext.contextText, /불안과 수면 어려움이 함께 나타난 사례 요약/);
  assert.doesNotMatch(result.evidence.aihubRagContext.contextText, /ANXIETY|sleep_disturbance|clarification_reflection/);
});

test('createCounselingTurn redacts detailed RAG context from LLM prompts by default', async () => {
  let observedPrompt = null;
  const ragContext = {
    available: true,
    privacyMode: 'summary_only',
    matches: [
      {
        condition: 'ANXIETY',
        score: 12,
        safeSummary: '민감한 상담 사례 요약은 외부 LLM으로 기본 전송하지 않는다.',
        topClientLabels: [{ label: 'sleep_disturbance', score: 2 }],
        topCounselorInterventions: [{ label: 'clarification_reflection', score: 2 }],
      },
    ],
    contextText: 'AIHub RAG 검색 근거: 민감한 상담 사례 요약은 외부 LLM으로 기본 전송하지 않는다.',
  };

  await createCounselingTurn({
    messages: [{ role: 'user', content: '요즘 불안하고 잠을 잘 못 자요.' }],
    inventory: loadAihubInventory(),
    aihubRagContext: ragContext,
    llmClient: async (prompt) => {
      observedPrompt = prompt;
      return {
        assistantMessage: '잠을 못 자는 시간이 이어져서 많이 지쳤겠어요.',
        actions: ['불안이 올라오는 순간을 한 단어로 적어봅니다.'],
        session: { title: '불안 탐색', focus: 'anxiety', steps: ['감정 반영'] },
      };
    },
  });

  assert.notEqual(observedPrompt.aihubRagContext.contextText, ragContext.contextText);
  assert.match(observedPrompt.aihubRagContext.contextText, /유사 요약 사례 1건/);
  assert.doesNotMatch(observedPrompt.aihubRagContext.contextText, /민감한 상담 사례 요약/);
});

test('createCounselingTurn gives the LLM Rogers-style response rules and RAG privacy boundaries', async () => {
  let observedPrompt = null;

  await createCounselingTurn({
    messages: [{ role: 'user', content: '요즘 잠을 못 자고 계속 불안해요.' }],
    inventory: loadAihubInventory(),
    aihubRagContext: {
      available: true,
      privacyMode: 'summary_only',
      matches: [],
      contextText: 'AIHub RAG 검색 근거(요약형, 원문 비노출): ANXIETY',
    },
    llmClient: async (prompt) => {
      observedPrompt = prompt;
      return {
        assistantMessage: '잠을 못 자는 시간이 이어져서 많이 지쳤겠어요.',
        actions: ['불안이 올라오는 순간을 한 단어로 적어봅니다.'],
        session: { title: '불안 탐색', focus: 'anxiety', steps: ['감정 반영'] },
      };
    },
  });

  assert.match(observedPrompt.responseStyle, /칼 로저스|인간중심|person-centered/i);
  assert.match(observedPrompt.responseStyle, /공감적 이해/);
  assert.match(observedPrompt.responseStyle, /무조건적 긍정적 존중|비판단/);
  assert.match(observedPrompt.responseStyle, /진솔성/);
  assert.match(observedPrompt.responseStyle, /한 번에 하나/);
  assert.match(observedPrompt.responseStyle, /RAG|검색 근거/);
  assert.match(observedPrompt.responseStyle, /원문|개인정보|라벨/);
});

test('createCounselingTurn skips RAG entirely for urgent safety branch', async () => {
  const result = await createCounselingTurn({
    messages: [{ role: 'user', content: '불안해서 수면제 몇 알 먹으면 죽을 수 있는지 알고 싶어요.' }],
    inventory: loadAihubInventory(),
    aihubRagContext: {
      available: true,
      privacyMode: 'summary_only',
      matches: [{ condition: 'ANXIETY', score: 20, safeSummary: '불안과 수면 어려움 요약.' }],
      contextText: 'AIHub RAG 검색 근거: ANXIETY 사례',
    },
    llmClient: async () => {
      throw new Error('urgent safety branch must not call LLM');
    },
  });

  assert.equal(result.source, 'safety');
  assert.equal(result.assessment.severity.level, 'urgent');
  assert.match(result.assistantMessage, /방법이나 수량/);
  assert.match(result.assistantMessage, /109|119|약/);
  assert.doesNotMatch(result.assistantMessage, /ANXIETY|RAG|라벨|사례/);
  assert.equal(result.assessment.aihubRag.skipped, true);
  assert.equal(result.report.ragSupport.skipped, true);
  assert.match(result.evidence.aihubRagContext.contextText, /안전 우선 분기/);
  assert.doesNotMatch(result.evidence.aihubRagContext.contextText, /ANXIETY|사례 1건/);
});

test('createCounselingTurn does not call the lazy RAG provider for urgent safety branch', async () => {
  let providerCalls = 0;

  const result = await createCounselingTurn({
    messages: [{ role: 'user', content: '수면제 몇 알 먹으면 죽을 수 있어?' }],
    inventory: loadAihubInventory(),
    aihubRagProvider: async () => {
      providerCalls += 1;
      return {
        available: true,
        privacyMode: 'summary_only',
        matches: [{ condition: 'ANXIETY', score: 10 }],
        contextText: '검색되면 안 되는 RAG 컨텍스트',
      };
    },
  });

  assert.equal(result.source, 'safety');
  assert.equal(providerCalls, 0);
  assert.equal(result.assessment.aihubRag.skipped, true);
});

test('createCounselingTurn falls back when the lazy RAG provider fails', async () => {
  const result = await createCounselingTurn({
    messages: [{ role: 'user', content: '요즘 불안하고 잠을 잘 못 자요.' }],
    inventory: loadAihubInventory(),
    aihubRagProvider: async () => {
      throw new Error('broken local rag index');
    },
  });

  assert.equal(result.source, 'demo');
  assert.equal(result.assessment.aihubRag.available, false);
  assert.equal(result.assessment.aihubRag.error, 'rag_provider_failed');
  assert.match(result.evidence.aihubRagContext.contextText, /사용할 수 없습니다/);
  assert.match(result.assistantMessage, /잠|불안|쉬고 싶은데|깨어/);
});

test('createCounselingTurn exposes RAG as non-diagnostic assessment support', async () => {
  const result = await createCounselingTurn({
    messages: [{ role: 'user', content: '요즘 불안하고 잠을 잘 못 자요.' }],
    inventory: loadAihubInventory(),
    aihubRagContext: {
      available: true,
      privacyMode: 'summary_only',
      matches: [
        {
          condition: 'ANXIETY',
          score: 18,
          safeSummary: '불안과 수면 어려움 요약.',
          topClientLabels: [
            { label: 'sleep_disturbance', score: 3 },
            { label: 'anxiety_mood', score: 2 },
          ],
          topCounselorInterventions: [{ label: 'clarification_reflection', score: 2 }],
        },
      ],
      contextText: 'AIHub RAG 검색 근거: ANXIETY 사례',
    },
  });

  assert.equal(result.assessment.aihubRag.available, true);
  assert.equal(result.assessment.aihubRag.matchCount, 1);
  assert.deepEqual(result.assessment.aihubRag.matchedConditions, [{ condition: 'ANXIETY', label: '불안 관련', count: 1 }]);
  assert.equal(result.report.ragSupport.matchedConditionText, '불안 관련 1건');
  assert.doesNotMatch(result.report.ragSupport.matchedConditionText, /ANXIETY/);
  assert.deepEqual(result.assessment.aihubRag.topClientLabels.slice(0, 2), [
    { label: 'sleep_disturbance', maxScore: 3 },
    { label: 'anxiety_mood', maxScore: 2 },
  ]);
  assert.match(result.assessment.aihubRag.boundary, /확정 진단이 아닌/);
});

test('createCounselingTurn returns a counseling summary report without raw transcript leakage', async () => {
  const result = await createCounselingTurn({
    messages: [
      { role: 'user', content: '요즘 불안하고 잠을 잘 못 자요.' },
      { role: 'assistant', content: '잠을 못 자는 시간이 이어져서 많이 지쳤겠어요.' },
      { role: 'user', content: '회사에서 있었던 일이 자꾸 떠올라요.' },
    ],
    inventory: loadAihubInventory(),
    aihubRagContext: {
      available: true,
      privacyMode: 'summary_only',
      matches: [
        {
          condition: 'ANXIETY',
          score: 18,
          safeSummary: '불안과 수면 어려움 요약.',
          topClientLabels: [{ label: 'sleep_disturbance', score: 3 }],
          topCounselorInterventions: [{ label: 'clarification_reflection', score: 2 }],
        },
      ],
      contextText: 'AIHub RAG 검색 근거: ANXIETY 사례',
    },
  });

  assert.equal(result.report.title, '상담 요약 보고서');
  assert.equal(result.report.userTurnCount, 2);
  assert.equal(result.report.currentHypothesis.label, '불안');
  assert.equal(result.report.ragSupport.matchCount, 1);
  assert.equal(result.report.ragSupport.matchedConditions[0].condition, 'ANXIETY');
  assert.match(result.report.boundary, /확정 진단이 아닌/);
  assert.ok(result.report.recommendedNextSteps.length >= 1);
  assert.doesNotMatch(JSON.stringify(result.report), /상담사\s*:|내담자\s*:|회사에서 있었던 일이 자꾸 떠올라요/);
});

function makeRagFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aihub-rag-'));
  const sourceDir = path.join(root, 'Training', '01.원천데이터', 'TS_002._불안장애_0001._1회기');
  const labelDir = path.join(root, 'Training', '02.라벨링데이터', 'TL_002._불안장애_0001._1회기');
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.mkdirSync(labelDir, { recursive: true });
  fs.writeFileSync(
    path.join(sourceDir, 'resource_anxiety_1_check_A001.txt'),
    [
      '상담사 : 안녕하세요.',
      '내담자 : 요즘 잠을 못 자고 불안해요. 회사에서 심장이 뛰어요.',
      '상담사 : 불안했던 순간을 조금 더 말해볼까요?',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(labelDir, 'label_anxiety_1_check_A001.json'),
    JSON.stringify({
      filename: 'label_anxiety_1_check_A001',
      id: 'A001',
      class: 'ANXIETY',
      depression: 0,
      anxiety: 2,
      addiction: 0,
      summary: '불안과 수면 어려움을 호소하며, 상담사는 감정 반영과 명료화 질문을 사용했다.',
      paragraph: [
        {
          paragraph_speaker: '내담자',
          paragraph_text: '요즘 잠을 못 자고 불안해요. 회사에서 심장이 뛰어요.',
          sleep_disturbance: 2,
          anxiety: 2,
          stressful_event: 1,
        },
        {
          paragraph_speaker: '상담사',
          paragraph_text: '불안했던 순간을 조금 더 말해볼까요?',
          sympathy_support: 1,
          clarification_reflection: 2,
        },
      ],
    }),
  );
  return root;
}
