import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, '..');
const defaultInventoryPath = path.join(repoRoot, 'aihub_71806', 's3_file_list_normalized.json');
const defaultTrainingVideoPath = path.join(repoRoot, 'aihub_71806', 'training_video_notes.json');

export function loadAihubInventory(inventoryPath = defaultInventoryPath) {
  if (!fs.existsSync(inventoryPath)) {
    return fallbackInventory();
  }

  const raw = fs.readFileSync(inventoryPath, 'utf8');
  const parsed = JSON.parse(raw);

  return {
    available: true,
    datasetSn: parsed.datasetSn,
    fileCount: parsed.fileCount,
    totalFileSizeBytes: parsed.totalFileSizeBytes,
    roots: parsed.roots ?? [],
    files: parsed.files ?? [],
  };
}

export function summarizeInventory(inventory) {
  const splitCounts = {};
  const conditionCounts = {};

  for (const file of inventory.files) {
    const parts = file.fileStreCours.split('/');
    const splitKey = `${parts[3]}/${parts[4]}`;
    splitCounts[splitKey] = (splitCounts[splitKey] ?? 0) + 1;

    const condition = extractCondition(file.streFileNm);
    conditionCounts[condition] = (conditionCounts[condition] ?? 0) + 1;
  }

  return {
    datasetTitle: '심리상담 데이터',
    datasetSn: inventory.datasetSn,
    fileCount: inventory.files.length,
    totalFileSizeBytes: inventory.totalFileSizeBytes,
    splitCounts: orderedCounts(splitCounts, [
      'Training/01.원천데이터',
      'Training/02.라벨링데이터',
      'Validation/01.원천데이터',
      'Validation/02.라벨링데이터',
    ]),
    conditionCounts: orderedCounts(conditionCounts, ['우울증', '불안장애', '중독', '일반군']),
  };
}

export function loadTrainingVideoNotes(notesPath = defaultTrainingVideoPath) {
  if (!fs.existsSync(notesPath)) {
    return fallbackTrainingVideoNotes();
  }

  const raw = fs.readFileSync(notesPath, 'utf8');
  return JSON.parse(raw);
}

export function summarizeTrainingVideoNotes(notes) {
  return {
    url: notes.url,
    datasetHours: notes.datasetFacts.hours,
    processedCounselingCases: notes.datasetFacts.processedCounselingCases,
    tokenCountText: notes.datasetFacts.tokenCountText,
    sentenceTokenCountText: notes.datasetFacts.sentenceTokenCountText,
    labelScale: notes.datasetFacts.labelScale,
    labels: notes.datasetFacts.labels,
    models: notes.models.map((model) => model.name),
    applicationIdeas: notes.applicationIdeas,
  };
}

export function buildKnowledgeContext(inventory, trainingVideoNotes = null, rawDatasetSummary = null, counselorStyleProfile = null) {
  const summary = summarizeInventory(inventory);
  const splitText = Object.entries(summary.splitCounts)
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ');
  const conditionText = Object.entries(summary.conditionCounts)
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ');

  const lines = [
    `AIHub 데이터셋: ${summary.datasetTitle} (${summary.datasetSn})`,
    `공개 파일 목록 기준 총 ${summary.fileCount}개 ZIP, 총 ${summary.totalFileSizeBytes} bytes.`,
    `구성: ${splitText}.`,
    `질환/군 파일명 분포: ${conditionText}.`,
  ];

  if (rawDatasetSummary?.available) {
    const classText = Object.entries(rawDatasetSummary.classCounts)
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');
    const signalText = (rawDatasetSummary.topParagraphSignals ?? [])
      .slice(0, 6)
      .map(({ label, count }) => `${label}: ${count}`)
      .join(', ');

    lines.push(
      `AIHub 원천/라벨 데이터 로드 완료: 원천 텍스트 ${rawDatasetSummary.sourceTextCount}개, 라벨 JSON ${rawDatasetSummary.labelJsonCount}개, 매칭 ${rawDatasetSummary.matchedPairCount}쌍.`,
      `라벨 클래스 분포: ${classText || '확인된 클래스 없음'}.`,
      `상위 문단 라벨 신호: ${signalText || '확인된 문단 라벨 없음'}.`,
    );
  } else {
    lines.push(
      '원본 ZIP 본문은 AIHub 로그인 및 다운로드 승인 이후 접근 가능하며, 현재 앱은 저장된 설명서/파일 목록/모델 산출물 메타데이터를 근거로 사용한다.',
    );
  }

  if (trainingVideoNotes) {
    const video = summarizeTrainingVideoNotes(trainingVideoNotes);
    lines.push(
      `교육 영상 참고: ${video.datasetHours}시간 상담 데이터, ${video.tokenCountText}, ${video.sentenceTokenCountText}.`,
      `라벨링: ${video.labels.join(', ')}를 ${video.labelScale}점 척도로 평가하며 DSM과 선행 연구 기준을 사용.`,
      `AI 모델: ${video.models.join(', ')}.`,
      `활용 방향: ${video.applicationIdeas.join(', ')}.`,
    );
  }

  if (counselorStyleProfile?.available) {
    const moveText = (counselorStyleProfile.primaryCounselorMoves ?? [])
      .slice(0, 5)
      .map(({ korean, label, count }) => `${korean ?? label}(${label}: ${count})`)
      .join(', ');
    lines.push(
      `실제 상담사 대화 학습: 상담사 발화 ${counselorStyleProfile.counselorTurnCount}개, 내담자 발화 ${counselorStyleProfile.clientTurnCount}개, 질문 비율 ${counselorStyleProfile.questionTurnRatio}.`,
      `실제 상담사의 주요 개입: ${moveText || '집계된 개입 없음'}.`,
      `칼 로저스식 상담기법 점검: ${counselorStyleProfile.rogerianSummary}`,
    );
  }

  return lines.join('\n');
}

function extractCondition(fileName = '') {
  const match = fileName.match(/\.\s*([^_]+)_/);
  return match?.[1] ?? '기타';
}

function orderedCounts(counts, keys) {
  return Object.fromEntries(keys.map((key) => [key, counts[key] ?? 0]));
}

function fallbackInventory() {
  return {
    available: false,
    datasetSn: '71806',
    fileCount: 0,
    totalFileSizeBytes: 0,
    roots: [],
    files: [],
  };
}

function fallbackTrainingVideoNotes() {
  return {
    available: false,
    url: 'https://www.youtube.com/watch?v=yZZPyNnqL4Y',
    datasetFacts: {
      hours: 1661,
      processedCounselingCases: 1661,
      tokenCountText: '40만 토큰 이상',
      sentenceTokenCountText: '46만 건 이상',
      labelScale: '0-3',
      labels: ['주요 증상', '위험 요인', '개선 요인', '개입 요인'],
    },
    models: [
      { name: 'KLUE-BERT 질환 예측' },
      { name: 'KoAlpaca 상담 보고서 생성' },
    ],
    applicationIdeas: ['정신건강 조기진단 서비스', '디지털 심리상담 플랫폼', '교육 및 연구 지원'],
  };
}
