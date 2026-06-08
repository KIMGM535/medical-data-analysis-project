import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, '..');
const defaultRawDatasetPath = path.join(repoRoot, 'aihub_71806', 'api_download', 'unzipped');
const orderedSplitKeys = [
  'Training/01.원천데이터',
  'Training/02.라벨링데이터',
  'Validation/01.원천데이터',
  'Validation/02.라벨링데이터',
];
const diagnosisFields = ['depression', 'anxiety', 'addiction'];
const excludedParagraphNumberFields = new Set(['start_point', 'end_point', 'character_count', 'cps', 'index']);

export function loadAihubRawDatasetSummary(rawDatasetPath = defaultRawDatasetPath) {
  if (!fs.existsSync(rawDatasetPath)) {
    return emptySummary(rawDatasetPath);
  }

  const files = walkFiles(rawDatasetPath);
  const sourceTextFiles = files.filter((filePath) => isSourceText(filePath));
  const labelJsonFiles = files.filter((filePath) => isLabelJson(filePath));
  const sourceKeys = new Set(sourceTextFiles.map(pairKey));
  const labelKeys = new Set(labelJsonFiles.map(pairKey));
  const unmatchedSourceTextCount = [...sourceKeys].filter((key) => !labelKeys.has(key)).length;
  const unmatchedLabelJsonCount = [...labelKeys].filter((key) => !sourceKeys.has(key)).length;
  const splitCounts = orderedCounts(
    files.reduce((counts, filePath) => {
      const splitKey = splitKeyFromPath(filePath);
      if (splitKey) counts[splitKey] = (counts[splitKey] ?? 0) + 1;
      return counts;
    }, {}),
  );

  const classCounts = {};
  const diagnosisScoreDistributions = Object.fromEntries(diagnosisFields.map((field) => [field, {}]));
  const paragraphSignalCounts = {};
  let nonStandardLabelJsonCount = 0;
  let invalidLabelJsonCount = 0;

  for (const labelPath of labelJsonFiles) {
    const { label, nonStandard } = readLabelJson(labelPath);
    if (!label) {
      for (const field of diagnosisFields) {
        increment(diagnosisScoreDistributions[field], 'missing');
      }
      invalidLabelJsonCount += 1;
      continue;
    }

    if (nonStandard) nonStandardLabelJsonCount += 1;
    increment(classCounts, label.class ?? 'UNKNOWN');
    for (const field of diagnosisFields) {
      increment(diagnosisScoreDistributions[field], String(label[field] ?? 'missing'));
    }
    for (const paragraph of label.paragraph ?? []) {
      for (const [key, value] of Object.entries(paragraph)) {
        if (excludedParagraphNumberFields.has(key)) continue;
        if (typeof value === 'number' && value > 0) {
          increment(paragraphSignalCounts, key);
        }
      }
    }
  }

  return {
    available: true,
    root: rawDatasetPath,
    sourceTextCount: sourceTextFiles.length,
    labelJsonCount: labelJsonFiles.length,
    matchedPairCount: [...labelKeys].filter((key) => sourceKeys.has(key)).length,
    unmatchedSourceTextCount,
    unmatchedLabelJsonCount,
    splitCounts,
    classCounts: sortCounts(classCounts),
    diagnosisScoreDistributions: sortNestedCounts(diagnosisScoreDistributions),
    paragraphSignalCounts: sortCounts(paragraphSignalCounts),
    topParagraphSignals: Object.entries(sortCounts(paragraphSignalCounts))
      .slice(0, 12)
      .map(([label, count]) => ({ label, count })),
    nonStandardLabelJsonCount,
    invalidLabelJsonCount,
    integrity: buildIntegrity({ unmatchedSourceTextCount, unmatchedLabelJsonCount, invalidLabelJsonCount }),
  };
}

function emptySummary(rawDatasetPath) {
  return {
    available: false,
    root: rawDatasetPath,
    sourceTextCount: 0,
    labelJsonCount: 0,
    matchedPairCount: 0,
    unmatchedSourceTextCount: 0,
    unmatchedLabelJsonCount: 0,
    splitCounts: orderedCounts({}),
    classCounts: {},
    diagnosisScoreDistributions: Object.fromEntries(diagnosisFields.map((field) => [field, {}])),
    paragraphSignalCounts: {},
    topParagraphSignals: [],
    nonStandardLabelJsonCount: 0,
    invalidLabelJsonCount: 0,
    integrity: { ok: false, issueCount: 1, issues: [{ reason: 'raw_dataset_missing', count: 1 }] },
  };
}

function buildIntegrity({ unmatchedSourceTextCount, unmatchedLabelJsonCount, invalidLabelJsonCount }) {
  const issues = [];
  if (unmatchedSourceTextCount > 0) {
    issues.push({ reason: 'source_without_label', count: unmatchedSourceTextCount });
  }
  if (unmatchedLabelJsonCount > 0) {
    issues.push({ reason: 'label_without_source', count: unmatchedLabelJsonCount });
  }
  if (invalidLabelJsonCount > 0) {
    issues.push({ reason: 'invalid_label_json', count: invalidLabelJsonCount });
  }
  return {
    ok: issues.length === 0,
    issueCount: issues.length,
    issues,
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

function splitKeyFromPath(filePath) {
  const parts = filePath.split(path.sep);
  const splitIndex = parts.findIndex((part) => part === 'Training' || part === 'Validation');
  if (splitIndex === -1 || !parts[splitIndex + 1]) return null;
  return `${parts[splitIndex]}/${parts[splitIndex + 1]}`;
}

function orderedCounts(counts) {
  return Object.fromEntries(orderedSplitKeys.map((key) => [key, counts[key] ?? 0]));
}

function increment(counts, key) {
  counts[key] = (counts[key] ?? 0) + 1;
}

function sortCounts(counts) {
  return Object.fromEntries(Object.entries(counts).sort(([aKey, aValue], [bKey, bValue]) => bValue - aValue || aKey.localeCompare(bKey)));
}

function sortNestedCounts(nestedCounts) {
  return Object.fromEntries(Object.entries(nestedCounts).map(([key, counts]) => [key, sortCounts(counts)]));
}
