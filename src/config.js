import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePositiveInteger } from './rateLimit.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, '..');

export function loadConfig() {
  loadDotEnv(path.join(repoRoot, '.env'));

  return {
    repoRoot,
    host: process.env.HOST || '127.0.0.1',
    port: Number(process.env.PORT || 5173),
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    openaiModel: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
    aihubApiKey: process.env.AIHUB_API_KEY || '',
    aihubRagIndexPath: process.env.AIHUB_RAG_INDEX_PATH || '',
    allowRemoteRagContext: ['1', 'true', 'yes'].includes((process.env.ALLOW_REMOTE_RAG_CONTEXT || '').toLowerCase()),
    chatRateLimitWindowMs: parsePositiveInteger(process.env.CHAT_RATE_LIMIT_WINDOW_MS, 600_000),
    chatRateLimitMax: parsePositiveInteger(process.env.CHAT_RATE_LIMIT_MAX, 120),
  };
}

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const index = trimmed.indexOf('=');
    if (index === -1) continue;

    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}
