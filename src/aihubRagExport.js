import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadAihubRagIndex,
  toDeployableAihubRagIndex,
  validateDeployableAihubRagIndex,
} from './aihubRag.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, '..');
const defaultRawDatasetPath = path.join(repoRoot, 'aihub_71806', 'api_download', 'unzipped');
const defaultOutputPath = path.join(repoRoot, 'app_data', 'aihub-rag-index.deploy.json');

export function exportDeployableAihubRagIndex({
  rawDatasetPath = defaultRawDatasetPath,
  outputPath = defaultOutputPath,
  createdAt = new Date().toISOString(),
} = {}) {
  const rawIndex = loadAihubRagIndex(rawDatasetPath);
  if (!rawIndex.available || rawIndex.recordCount === 0) {
    return {
      ok: false,
      error: 'raw_rag_index_unavailable',
      rawDatasetPath,
      outputPath,
      recordCount: 0,
    };
  }

  const deployable = toDeployableAihubRagIndex(rawIndex, { createdAt });
  const validation = validateDeployableAihubRagIndex(deployable);
  if (!validation.ok) {
    return {
      ok: false,
      error: 'deployable_rag_validation_failed',
      rawDatasetPath,
      outputPath,
      recordCount: deployable.recordCount,
      validation,
    };
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(deployable, null, 2)}\n`);

  return {
    ok: true,
    rawDatasetPath,
    outputPath,
    recordCount: deployable.recordCount,
    classCounts: deployable.classCounts,
    validation,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const outputPath = process.argv[2] ? path.resolve(process.argv[2]) : defaultOutputPath;
  const rawDatasetPath = process.argv[3] ? path.resolve(process.argv[3]) : defaultRawDatasetPath;
  const result = exportDeployableAihubRagIndex({ rawDatasetPath, outputPath });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
