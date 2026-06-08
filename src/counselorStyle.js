import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, '..');
const defaultRawDatasetPath = path.join(repoRoot, 'aihub_71806', 'api_download', 'unzipped');
const interventionLabels = [
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
];
const rogerianMap = {
  empathicUnderstanding: {
    label: '공감적 이해',
    fields: ['sympathy_support'],
  },
  accurateReflection: {
    label: '명료화와 반영',
    fields: ['clarification_reflection'],
  },
  nonjudgmentalAcceptance: {
    label: '비판단적 수용',
    fields: ['sympathy_support', 'structuring'],
  },
  collaborativeCongruence: {
    label: '진솔한 협력 구조화',
    fields: ['process_feedback', 'structuring', 'goal_setting'],
  },
};

export function loadCounselorStyleProfile(rawDatasetPath = defaultRawDatasetPath) {
  if (!fs.existsSync(rawDatasetPath)) return emptyProfile(rawDatasetPath);

  const files = walkFiles(rawDatasetPath);
  const sourceFiles = files.filter((filePath) => filePath.endsWith('.txt') && filePath.includes(`${path.sep}01.원천데이터${path.sep}`));
  const labelFiles = files.filter((filePath) => filePath.endsWith('.json') && filePath.includes(`${path.sep}02.라벨링데이터${path.sep}`));
  const turnStats = collectTurnStats(sourceFiles);
  const labelStats = collectLabelStats(labelFiles);
  const rogerianEvidence = buildRogerianEvidence(labelStats.interventionCounts);
  const primaryCounselorMoves = Object.entries(sortCounts(labelStats.interventionCounts))
    .slice(0, 8)
    .map(([label, count]) => ({ label, count, korean: interventionKorean(label) }));

  return {
    available: true,
    root: rawDatasetPath,
    sourceFileCount: sourceFiles.length,
    labelFileCount: labelFiles.length,
    counselorTurnCount: turnStats.counselorTurnCount,
    clientTurnCount: turnStats.clientTurnCount,
    questionTurnCount: turnStats.questionTurnCount,
    questionTurnRatio: ratio(turnStats.questionTurnCount, turnStats.counselorTurnCount),
    averageCounselorTurnChars: Math.round(ratio(turnStats.counselorChars, turnStats.counselorTurnCount)),
    interventionCounts: sortCounts(labelStats.interventionCounts),
    primaryCounselorMoves,
    rogerianEvidence,
    rogerianSummary: summarizeRogerianEvidence(rogerianEvidence),
    nonStandardLabelJsonCount: labelStats.nonStandardLabelJsonCount,
    invalidLabelJsonCount: labelStats.invalidLabelJsonCount,
  };
}

export function buildCounselorStyleGuidance(profile) {
  if (!profile?.available) {
    return '실제 상담사 대화 학습 프로필은 아직 로드되지 않았습니다.';
  }

  const moves = profile.primaryCounselorMoves
    .slice(0, 5)
    .map((move) => `${move.korean}(${move.label}: ${move.count})`)
    .join(', ');
  const rogerian = Object.values(profile.rogerianEvidence)
    .map((item) => `${item.label}: ${item.count}`)
    .join(', ');

  return [
    `실제 상담사 대화 학습: 상담사 발화 ${profile.counselorTurnCount}개, 내담자 발화 ${profile.clientTurnCount}개, 상담사 질문 비율 ${profile.questionTurnRatio}.`,
    `주요 상담사 개입: ${moves}.`,
    `칼 로저스식 핵심 조건 근거: ${rogerian}.`,
    '응답 원칙: 먼저 감정을 반영하고, 원인을 단정하지 않으며, 한 번에 하나의 열린 질문으로 내담자의 의미를 따라간다. 진단·조치 제안은 충분한 맥락이나 안전 필요가 있을 때만 짧게 둔다.',
  ].join('\n');
}

function emptyProfile(rawDatasetPath) {
  return {
    available: false,
    root: rawDatasetPath,
    sourceFileCount: 0,
    labelFileCount: 0,
    counselorTurnCount: 0,
    clientTurnCount: 0,
    questionTurnCount: 0,
    questionTurnRatio: 0,
    averageCounselorTurnChars: 0,
    interventionCounts: {},
    primaryCounselorMoves: [],
    rogerianEvidence: buildRogerianEvidence({}),
    rogerianSummary: '원천 데이터가 없어 평가하지 못했습니다.',
    nonStandardLabelJsonCount: 0,
    invalidLabelJsonCount: 0,
  };
}

function collectTurnStats(sourceFiles) {
  const stats = {
    counselorTurnCount: 0,
    clientTurnCount: 0,
    questionTurnCount: 0,
    counselorChars: 0,
  };

  for (const filePath of sourceFiles) {
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('상담사 :')) {
        const text = trimmed.slice('상담사 :'.length).trim();
        stats.counselorTurnCount += 1;
        stats.counselorChars += text.length;
        if (isQuestionLike(text)) stats.questionTurnCount += 1;
      } else if (trimmed.startsWith('내담자 :')) {
        stats.clientTurnCount += 1;
      }
    }
  }

  return stats;
}

function collectLabelStats(labelFiles) {
  const interventionCounts = {};
  let nonStandardLabelJsonCount = 0;
  let invalidLabelJsonCount = 0;

  for (const filePath of labelFiles) {
    const { label, nonStandard } = readLabelJson(filePath);
    if (!label) {
      invalidLabelJsonCount += 1;
      continue;
    }
    if (nonStandard) nonStandardLabelJsonCount += 1;

    for (const paragraph of label.paragraph ?? []) {
      if (paragraph.paragraph_speaker !== '상담사') continue;
      for (const field of interventionLabels) {
        if (typeof paragraph[field] === 'number' && paragraph[field] > 0) {
          increment(interventionCounts, field);
        }
      }
    }
  }

  return { interventionCounts, nonStandardLabelJsonCount, invalidLabelJsonCount };
}

function buildRogerianEvidence(interventionCounts) {
  return Object.fromEntries(
    Object.entries(rogerianMap).map(([key, item]) => [
      key,
      {
        label: item.label,
        fields: item.fields,
        count: item.fields.reduce((sum, field) => sum + (interventionCounts[field] ?? 0), 0),
      },
    ]),
  );
}

function summarizeRogerianEvidence(evidence) {
  const empathy = evidence.empathicUnderstanding.count;
  const reflection = evidence.accurateReflection.count;
  if (empathy > 0 && reflection > 0) {
    return '공감적 이해와 명료화/반영이 실제 상담사 개입의 핵심 축으로 확인됩니다.';
  }
  return '로저스식 핵심 조건은 일부만 확인되며 추가 데이터 검토가 필요합니다.';
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
      return { label: null, nonStandard: true };
    }
  }
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

function isQuestionLike(text) {
  return /[?？]|\b(나요|까요|습니까|세요)\??$/.test(text);
}

function ratio(numerator, denominator) {
  if (!denominator) return 0;
  return Number((numerator / denominator).toFixed(3));
}

function increment(counts, key) {
  counts[key] = (counts[key] ?? 0) + 1;
}

function sortCounts(counts) {
  return Object.fromEntries(Object.entries(counts).sort(([aKey, aValue], [bKey, bValue]) => bValue - aValue || aKey.localeCompare(bKey)));
}

function interventionKorean(label) {
  return (
    {
      sympathy_support: '공감/지지',
      clarification_reflection: '명료화/반영',
      cognitive_restructuring: '인지재구성',
      information_provision: '정보 제공',
      goal_setting: '목표 설정',
      process_feedback: '과정 피드백',
      behavioral_intervention: '행동 개입',
      task_assignment: '과제 부여',
      training_of_coping_skills: '대처기술 훈련',
      emotional_regulation_education_training: '정서조절 교육훈련',
      structuring: '상담 구조화',
    }[label] ?? label
  );
}
