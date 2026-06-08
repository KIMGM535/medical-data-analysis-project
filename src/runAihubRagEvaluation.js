import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAihubRagIndex, loadDeployableAihubRagIndex } from './aihubRag.js';
import { evaluateAihubRagParity } from './aihubRagEvaluation.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, '..');
const defaultDeployablePath = path.join(repoRoot, 'app_data', 'aihub-rag-index.deploy.json');

const deployablePath = process.argv[2] ? path.resolve(process.argv[2]) : defaultDeployablePath;
const rawIndex = loadAihubRagIndex();
const deployableIndex = loadDeployableAihubRagIndex(deployablePath);
const result = evaluateAihubRagParity({ rawIndex, deployableIndex });

console.log(JSON.stringify({
  deployablePath,
  rawRecordCount: rawIndex.recordCount,
  deployableRecordCount: deployableIndex.recordCount,
  deployableValidationError: deployableIndex.error ?? null,
  ...result,
}, null, 2));

if (!result.ok) process.exitCode = 1;
