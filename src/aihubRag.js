import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, '..');
const defaultRawDatasetPath = path.join(repoRoot, 'aihub_71806', 'api_download', 'unzipped');
const diagnosisFields = ['depression', 'anxiety', 'addiction'];
const excludedParagraphFields = new Set([
  'paragraph_speaker',
  'paragraph_text',
  'start_point',
  'end_point',
  'character_count',
  'cps',
  'index',
]);
const counselorInterventionLabels = new Set([
  'sympathy_support',
  'clarification_reflection',
  'cognitive_restructuring',
  'information_provision',
  'goal_setting',
  'process_feedback',
  'behavioral_intervention',
  'task_assignment',
  'training_of_coping_skills',
  'emotional_regulation_education_training',
  'structuring',
]);
const queryFeatureRules = [
  { feature: 'sleep_disturbance', patterns: [/잠/i, /불면/i, /못\s*자/i, /수면/i] },
  { feature: 'anxiety', patterns: [/불안/i, /걱정/i, /초조/i, /긴장/i, /공황/i, /숨/i, /가슴/i, /심장/i] },
  { feature: 'depression', patterns: [/우울/i, /무기력/i, /의욕/i, /희망/i, /사라지고/i, /죽고\s*싶/i] },
  { feature: 'addiction', patterns: [/술/i, /알코올/i, /도박/i, /마약/i, /중독/i, /끊/i, /마시/i] },
  { feature: 'stressful_event', patterns: [/회사/i, /직장/i, /시험/i, /가족/i, /친구/i, /관계/i, /폭력/i, /상실/i] },
  { feature: 'trauma', patterns: [/성폭행/i, /성폭력/i, /강간/i, /성추행/i, /학대/i, /맞았/i, /트라우마/i, /플래시백/i, /몸이\s*내\s*몸/i] },
  { feature: 'self_harm', patterns: [/자살/i, /죽고\s*싶/i, /해치/i, /수면제/i, /과다복용/i] },
  { feature: 'grief', patterns: [/상실/i, /사별/i, /세상.*떠/i, /죽었/i, /자살.*소식/i] },
];

export function loadAihubRagIndex(rawDatasetPath = defaultRawDatasetPath) {
  if (!fs.existsSync(rawDatasetPath)) {
    return emptyIndex(rawDatasetPath);
  }

  const files = walkFiles(rawDatasetPath);
  const sourceFiles = files.filter(isSourceText);
  const labelFiles = files.filter(isLabelJson);
  const sourcePathByKey = new Map(sourceFiles.map((filePath) => [pairKey(filePath), filePath]));
  const records = [];
  let nonStandardLabelJsonCount = 0;
  let invalidLabelJsonCount = 0;

  for (const labelPath of labelFiles) {
    const { label, nonStandard } = readLabelJson(labelPath);
    if (!label) {
      invalidLabelJsonCount += 1;
      continue;
    }
    if (nonStandard) nonStandardLabelJsonCount += 1;

    const sourcePath = sourcePathByKey.get(pairKey(labelPath));
    const record = buildRecord(label, labelPath, sourcePath);
    if (record) records.push(record);
  }

  return {
    available: records.length > 0,
    root: rawDatasetPath,
    privacyMode: 'summary_only',
    recordCount: records.length,
    sourceTextCount: sourceFiles.length,
    labelJsonCount: labelFiles.length,
    sourceMatchedRecordCount: records.filter((record) => record.hasSourceText).length,
    classCounts: countBy(records, (record) => record.condition),
    nonStandardLabelJsonCount,
    invalidLabelJsonCount,
    records,
  };
}

export function loadDeployableAihubRagIndex(indexPath) {
  if (!indexPath || !fs.existsSync(indexPath)) {
    return emptyDeployableIndex('deployable_rag_index_missing');
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    const validation = validateDeployableAihubRagIndex(parsed);
    if (!validation.ok) {
      return {
        ...emptyDeployableIndex('deployable_rag_validation_failed'),
        validation,
      };
    }

    const records = Array.isArray(parsed.records) ? parsed.records : [];
    return {
      available: records.length > 0,
      kind: parsed.kind,
      version: parsed.version,
      privacyMode: parsed.privacyMode ?? 'deployable_summary_only',
      createdAt: parsed.createdAt,
      recordCount: records.length,
      sourceTextCount: 0,
      labelJsonCount: 0,
      sourceMatchedRecordCount: 0,
      classCounts: parsed.classCounts ?? countBy(records, (record) => record.condition),
      nonStandardLabelJsonCount: 0,
      invalidLabelJsonCount: 0,
      records,
    };
  } catch {
    return emptyDeployableIndex('deployable_rag_parse_failed');
  }
}

export function summarizeAihubRagIndex(index) {
  return {
    available: Boolean(index?.available),
    root: index?.root,
    privacyMode: index?.privacyMode ?? 'summary_only',
    recordCount: index?.recordCount ?? 0,
    sourceTextCount: index?.sourceTextCount ?? 0,
    labelJsonCount: index?.labelJsonCount ?? 0,
    sourceMatchedRecordCount: index?.sourceMatchedRecordCount ?? 0,
    classCounts: index?.classCounts ?? {},
    nonStandardLabelJsonCount: index?.nonStandardLabelJsonCount ?? 0,
    invalidLabelJsonCount: index?.invalidLabelJsonCount ?? 0,
  };
}

export function toDeployableAihubRagIndex(index, { createdAt = new Date().toISOString() } = {}) {
  const records = Array.isArray(index?.records) ? index.records.map(toDeployableRecord) : [];
  return {
    kind: 'aihub_71806_deployable_rag_index',
    version: 1,
    privacyMode: 'deployable_summary_only',
    createdAt,
    recordCount: records.length,
    classCounts: countBy(records, (record) => record.condition),
    records,
  };
}

export function validateDeployableAihubRagIndex(index) {
  const issues = [];
  const records = Array.isArray(index?.records) ? index.records : [];

  records.forEach((record, recordIndex) => {
    for (const field of Object.keys(record)) {
      if (!deployableRecordFields.has(field)) {
        issues.push({ recordIndex, reason: 'forbidden_record_field', field });
      }
    }
  });

  visitStrings(index, (value, pathKey) => {
    if (/내담자\s*:|상담사\s*:/i.test(value)) {
      issues.push({ path: pathKey, reason: 'speaker_prefix_leak' });
    }
    if (rawFilenameOrPathPattern.test(value)) {
      issues.push({ path: pathKey, reason: 'raw_filename_or_path_leak' });
    }
    if (caseIdentifierPattern.test(value)) {
      issues.push({ path: pathKey, reason: 'case_identifier_leak' });
    }
  });

  return {
    ok: issues.length === 0,
    issueCount: issues.length,
    issues,
  };
}

export function buildAihubRagContext(index, { messages = [], query = '', limit = 3 } = {}) {
  if (!index?.available || !Array.isArray(index.records) || index.records.length === 0) {
    return {
      available: false,
      privacyMode: index?.privacyMode ?? 'summary_only',
      queryFeatures: [],
      matches: [],
      contextText: 'AIHub RAG 인덱스가 아직 로드되지 않았습니다. 원문 데이터 없이 기존 지식과 안전 규칙으로 응답합니다.',
    };
  }

  const queryText = query || recentUserText(messages);
  const queryFeatures = inferQueryFeatures(queryText);
  const scoredMatches = index.records
    .map((record) => ({ ...record, score: scoreRecord(record, queryText, queryFeatures) }))
    .filter((record) => record.score > 0)
    .sort((a, b) => b.score - a.score || b.diagnosisStrength - a.diagnosisStrength);
  const matches = selectRagMatches(scoredMatches, queryFeatures, limit)
    .map(toPublicMatch);

  return {
    available: matches.length > 0,
    privacyMode: index.privacyMode,
    queryFeatures,
    matches,
    contextText: formatRagContext(matches),
  };
}

const deployableRecordFields = new Set([
  'condition',
  'diagnosisScores',
  'diagnosisStrength',
  'topClientLabels',
  'topCounselorInterventions',
  'sourceSignals',
  'safeSummary',
  'searchText',
]);
const rawFilenameOrPathPattern =
  /(?:^|[/\\\s])(?:resource|label)_(?:depression|anxiety|addiction|normal)_[^\s]*|\.txt\b|\.json\b|aihub_71806[/\\]|api_download|01\.원천데이터|02\.라벨링데이터|[/\\]tmp[/\\]/i;
const caseIdentifierPattern = /\b(?:depression|anxiety|addiction|normal)_\d+_check_[ADN]\d{3}\b/i;

function toDeployableRecord(record) {
  return {
    condition: record.condition,
    diagnosisScores: { ...record.diagnosisScores },
    diagnosisStrength: record.diagnosisStrength,
    topClientLabels: cloneLabels(record.topClientLabels),
    topCounselorInterventions: cloneLabels(record.topCounselorInterventions),
    sourceSignals: { ...record.sourceSignals },
    safeSummary: record.safeSummary,
    searchText: record.searchText,
  };
}

function cloneLabels(labels = []) {
  return labels.map((item) => ({ label: item.label, score: item.score }));
}

function visitStrings(value, callback, pathKey = '$') {
  if (typeof value === 'string') {
    callback(value, pathKey);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => visitStrings(item, callback, `${pathKey}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    visitStrings(child, callback, `${pathKey}.${key}`);
  }
}

function buildRecord(label, labelPath, sourcePath) {
  const paragraphs = Array.isArray(label.paragraph) ? label.paragraph : [];
  const diagnosisScores = Object.fromEntries(diagnosisFields.map((field) => [field, Number(label[field] ?? 0) || 0]));
  const topClientLabels = collectParagraphLabels(paragraphs, 'client');
  const topCounselorInterventions = collectParagraphLabels(paragraphs, 'counselor');
  const sourceSignals = sourcePath ? collectSourceSignals(sourcePath) : {};
  const safeSummary = buildSafeSummary(label, topClientLabels, topCounselorInterventions);

  return {
    caseKey: pairKey(labelPath),
    condition: label.class ?? inferConditionFromPath(labelPath),
    diagnosisScores,
    diagnosisStrength: Math.max(...Object.values(diagnosisScores), 0),
    topClientLabels,
    topCounselorInterventions,
    sourceSignals,
    safeSummary,
    searchText: buildSearchText(label, topClientLabels, topCounselorInterventions, sourceSignals, safeSummary),
    hasSourceText: Boolean(sourcePath),
  };
}

function collectSourceSignals(sourcePath) {
  const signals = {};
  const lines = fs.readFileSync(sourcePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('내담자 :')) continue;
    const text = trimmed.slice('내담자 :'.length).trim();
    for (const rule of queryFeatureRules) {
      if (rule.patterns.some((pattern) => pattern.test(text))) {
        signals[rule.feature] = (signals[rule.feature] ?? 0) + 1;
      }
    }
  }
  return signals;
}

function collectParagraphLabels(paragraphs, speakerType) {
  const counts = {};
  for (const paragraph of paragraphs) {
    if (!speakerMatches(paragraph.paragraph_speaker, speakerType)) continue;
    for (const [key, value] of Object.entries(paragraph)) {
      if (excludedParagraphFields.has(key)) continue;
      if (speakerType === 'counselor' && !counselorInterventionLabels.has(key)) continue;
      if (speakerType === 'client' && counselorInterventionLabels.has(key)) continue;
      if (typeof value === 'number' && value > 0) {
        counts[key] = Math.max(counts[key] ?? 0, value);
      }
    }
  }
  return Object.entries(counts)
    .sort(([aLabel, aScore], [bLabel, bScore]) => bScore - aScore || aLabel.localeCompare(bLabel))
    .slice(0, 8)
    .map(([label, score]) => ({ label, score }));
}

function speakerMatches(speaker = '', speakerType) {
  if (speakerType === 'counselor') return speaker === '상담사' || /counselor|therapist/i.test(speaker);
  return speaker !== '상담사' && !/counselor|therapist/i.test(speaker);
}

function buildSafeSummary(label, clientLabels, counselorLabels) {
  const explicitSummary = typeof label.summary === 'string' ? sanitizeSummary(label.summary) : '';
  if (explicitSummary) return explicitSummary;

  const clientText = clientLabels.slice(0, 4).map((item) => `${item.label} ${item.score}`).join(', ');
  const counselorText = counselorLabels.slice(0, 4).map((item) => `${item.label} ${item.score}`).join(', ');
  return sanitizeSummary(`내담자 라벨: ${clientText || '없음'}. 상담사 개입: ${counselorText || '없음'}.`);
}

function sanitizeSummary(text = '') {
  return String(text)
    .replace(/상담사\s*:/g, '')
    .replace(/내담자\s*:/g, '')
    .replace(/\b010[-\s]?\d{4}[-\s]?\d{4}\b/g, '[전화번호]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[이메일]')
    .replace(/\d{6}-\d{7}/g, '[식별번호]')
    .replace(/\b\d{2,6}[-\s]\d{2,6}[-\s]\d{4,8}\b/g, '[계좌]')
    .replace(/카카오(?:톡)?\s*ID\s*[:：]?\s*[A-Za-z0-9._-]+/gi, '[카카오ID]')
    .replace(/(?:내담자명|이름|성명)\s*[:：]?\s*[가-힣]{2,4}(?=\s|은|는|이|가|님|씨|$)/g, '[이름]')
    .replace(/(?<![가-힣])[가-힣]{2,4}\s*(?:씨|님)(?=은|는|이|가|을|를|에게|께|과|와|도|의|처럼|한테|\s|[,.;]|$)/g, '[이름]')
    .replace(/[가-힣A-Za-z0-9]+(?:초등학교|중학교|고등학교|대학교|대학원)/g, '[학교]')
    .replace(/[가-힣A-Za-z0-9]+(?:회사|주식회사|병원|센터)/g, '[직장]')
    .replace(
      /(?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)(?:특별시|광역시|특별자치시|특별자치도|도|시)?\s*[가-힣0-9]+(?:구|군|시)\s*[가-힣0-9]+(?:동|읍|면|로|길)?/g,
      '[주소]',
    )
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

function buildSearchText(label, clientLabels, counselorLabels, sourceSignals, safeSummary) {
  return [
    label.class,
    ...diagnosisFields.filter((field) => Number(label[field] ?? 0) > 0),
    ...clientLabels.map((item) => item.label),
    ...counselorLabels.map((item) => item.label),
    ...Object.keys(sourceSignals),
    safeSummary,
  ]
    .filter(Boolean)
    .join(' ');
}

function scoreRecord(record, queryText, queryFeatures) {
  const queryTokens = tokenize(queryText);
  const searchTokens = new Set(tokenize(record.searchText));
  let score = 0;

  for (const token of queryTokens) {
    if (searchTokens.has(token)) score += 1;
  }

  const labelScores = new Map(record.topClientLabels.map((item) => [item.label, item.score]));
  for (const feature of queryFeatures) {
    if (labelScores.has(feature)) score += 6 + labelScores.get(feature);
    if (record.sourceSignals?.[feature]) score += Math.min(4, record.sourceSignals[feature]);
  }

  if (queryFeatures.includes('anxiety') && record.condition === 'ANXIETY') score += 5 + record.diagnosisScores.anxiety;
  if (queryFeatures.includes('depression') && record.condition === 'DEPRESSION') score += 5 + record.diagnosisScores.depression;
  if (queryFeatures.includes('addiction') && record.condition === 'ADDICTION') score += 5 + record.diagnosisScores.addiction;
  if (queryFeatures.includes('grief') && labelScores.has('stressful_event')) score += 3;
  if (queryFeatures.includes('trauma') && labelScores.has('stressful_event')) score += 3;
  if (queryFeatures.includes('self_harm') && (labelScores.has('suicidal_accident') || labelScores.has('self_harm'))) score += 5;

  return score;
}

function selectRagMatches(scoredMatches, queryFeatures, limit) {
  if (!shouldDiversifyMatches(queryFeatures)) {
    return scoredMatches.slice(0, limit);
  }

  const selected = [];
  const seenConditions = new Set();
  for (const match of scoredMatches) {
    if (selected.length >= limit) break;
    if (seenConditions.has(match.condition)) continue;
    selected.push(match);
    seenConditions.add(match.condition);
  }
  for (const match of scoredMatches) {
    if (selected.length >= limit) break;
    if (selected.includes(match)) continue;
    selected.push(match);
  }
  return selected;
}

function shouldDiversifyMatches(queryFeatures) {
  const conditionSpecificFeatures = new Set(['anxiety', 'depression', 'addiction', 'self_harm', 'grief', 'trauma']);
  return !queryFeatures.some((feature) => conditionSpecificFeatures.has(feature));
}

function inferQueryFeatures(text = '') {
  const features = queryFeatureRules
    .filter((rule) => rule.patterns.some((pattern) => pattern.test(text)))
    .map((rule) => rule.feature);
  if (isAnotherPersonSuicideNews(text) && !hasUserSelfHarmIntent(text)) {
    return features.filter((feature) => feature !== 'self_harm');
  }
  return features;
}

function isAnotherPersonSuicideNews(text = '') {
  const person = /친구|가족|엄마|아빠|어머니|아버지|형제|자매|애인|지인|동료|선배|후배|사람/i;
  const death = /자살|극단적\s*선택|목매달|목을\s*매|세상.*떠|죽었|사망/i;
  return new RegExp(`${person.source}.{0,24}${death.source}`, 'i').test(text)
    || new RegExp(`${death.source}.{0,24}${person.source}`, 'i').test(text);
}

function hasUserSelfHarmIntent(text = '') {
  return /(나도|나|저|내가).{0,18}(죽고\s*싶|자살|따라가|사라지고\s*싶|끝내고\s*싶|해치고\s*싶)/i.test(text)
    || /(죽고\s*싶|자살|따라가|사라지고\s*싶|끝내고\s*싶|해치고\s*싶).{0,18}(나도|나|저|내가)/i.test(text);
}

function recentUserText(messages) {
  return messages
    .filter((message) => message.role === 'user')
    .slice(-6)
    .map((message) => message.content ?? '')
    .join('\n');
}

function toPublicMatch(record) {
  return {
    condition: record.condition,
    score: record.score,
    diagnosisScores: record.diagnosisScores,
    safeSummary: record.safeSummary,
    topClientLabels: record.topClientLabels,
    topCounselorInterventions: record.topCounselorInterventions,
  };
}

function formatRagContext(matches) {
  if (matches.length === 0) {
    return 'AIHub RAG 검색 근거: 현재 입력과 충분히 맞는 요약 사례가 없습니다. 원문은 노출하지 않습니다.';
  }

  return [
    'AIHub RAG 검색 근거(요약형, 원문 비노출):',
    ...matches.map((match) => {
      const clientLabels = formatLabels(match.topClientLabels);
      const interventions = formatLabels(match.topCounselorInterventions);
      const diagnosis = diagnosisFields.map((field) => `${field} ${match.diagnosisScores[field]}`).join(', ');
      return `- ${match.condition} 사례(score ${match.score}): 진단점수 ${diagnosis}; 내담자 라벨 ${clientLabels}; 상담사 개입 ${interventions}; 요약 ${match.safeSummary}`;
    }),
  ].join('\n');
}

function formatLabels(labels) {
  return labels.length ? labels.slice(0, 5).map((item) => `${item.label} ${item.score}`).join(', ') : '없음';
}

function tokenize(text = '') {
  return String(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_]+/gu, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 2);
}

function emptyIndex(rawDatasetPath) {
  return {
    available: false,
    root: rawDatasetPath,
    privacyMode: 'summary_only',
    recordCount: 0,
    sourceTextCount: 0,
    labelJsonCount: 0,
    sourceMatchedRecordCount: 0,
    classCounts: {},
    nonStandardLabelJsonCount: 0,
    invalidLabelJsonCount: 0,
    records: [],
  };
}

function emptyDeployableIndex(error) {
  return {
    available: false,
    kind: 'aihub_71806_deployable_rag_index',
    privacyMode: 'deployable_summary_only',
    recordCount: 0,
    sourceTextCount: 0,
    labelJsonCount: 0,
    sourceMatchedRecordCount: 0,
    classCounts: {},
    nonStandardLabelJsonCount: 0,
    invalidLabelJsonCount: 0,
    records: [],
    error,
  };
}

function readLabelJson(labelPath) {
  const raw = fs.readFileSync(labelPath, 'utf8');
  try {
    return { label: JSON.parse(raw), nonStandard: false };
  } catch {
    const normalized = raw.replace(/:\s*Infinity\b/g, ': null');
    try {
      return { label: JSON.parse(normalized), nonStandard: true };
    } catch {
      const fallback = parseTopLevelLabel(raw);
      return fallback ? { label: fallback, nonStandard: true } : { label: null, nonStandard: true };
    }
  }
}

function parseTopLevelLabel(raw) {
  const fallback = {};
  for (const field of ['filename', 'id', 'gender', 'class']) {
    const value = matchStringField(raw, field);
    if (value) fallback[field] = value;
  }
  for (const field of diagnosisFields) {
    const value = matchNumberField(raw, field);
    if (value !== null) fallback[field] = value;
  }
  fallback.paragraph = [];
  return Object.keys(fallback).length > 1 ? fallback : null;
}

function matchStringField(raw, field) {
  const match = raw.match(new RegExp(`"${field}"\\s*:\\s*"([^"]*)"`));
  return match?.[1] ?? null;
}

function matchNumberField(raw, field) {
  const match = raw.match(new RegExp(`"${field}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`));
  return match ? Number(match[1]) : null;
}

function walkFiles(root) {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files.sort();
}

function isSourceText(filePath) {
  return filePath.endsWith('.txt') && filePath.includes(`${path.sep}01.원천데이터${path.sep}`);
}

function isLabelJson(filePath) {
  return filePath.endsWith('.json') && filePath.includes(`${path.sep}02.라벨링데이터${path.sep}`);
}

function pairKey(filePath) {
  return path
    .basename(filePath, path.extname(filePath))
    .replace(/^resource_/, '')
    .replace(/^label_/, '');
}

function inferConditionFromPath(filePath) {
  if (/depression|우울증/.test(filePath)) return 'DEPRESSION';
  if (/anxiety|불안장애/.test(filePath)) return 'ANXIETY';
  if (/addiction|중독/.test(filePath)) return 'ADDICTION';
  if (/normal|일반군/.test(filePath)) return 'NORMAL';
  return 'UNKNOWN';
}

function countBy(items, keyFn) {
  const counts = {};
  for (const item of items) {
    const key = keyFn(item) ?? 'UNKNOWN';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([aKey, aValue], [bKey, bValue]) => bValue - aValue || aKey.localeCompare(bKey)));
}
