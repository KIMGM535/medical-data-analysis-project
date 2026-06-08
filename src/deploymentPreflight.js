import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDeployableAihubRagIndex } from './aihubRag.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, '..');

export function runDeploymentPreflight({
  env = process.env,
  rootDir = repoRoot,
  readFile = fs.readFileSync,
  exists = fs.existsSync,
} = {}) {
  const checks = [];
  const add = (status, code, message, details = {}) => {
    checks.push({ status, code, message, ...details });
  };

  if (env.OPENAI_API_KEY) {
    add('pass', 'openai_api_key_present', 'OPENAI_API_KEY가 설정되어 있습니다.');
  } else {
    add('fail', 'openai_api_key_missing', 'OPENAI_API_KEY가 없습니다. 서버 상담 응답 생성에 필요합니다.');
  }

  const ragPath = normalizeOptionalPath(env.AIHUB_RAG_INDEX_PATH, rootDir);
  if (!env.AIHUB_RAG_INDEX_PATH) {
    add('fail', 'aihub_rag_index_path_missing', 'AIHUB_RAG_INDEX_PATH가 없습니다. 배포 서버에는 비식별 RAG 인덱스 경로가 필요합니다.');
  } else if (pointsToRawAihubArea(ragPath)) {
    add(
      'fail',
      'aihub_rag_index_path_points_to_raw_area',
      'AIHUB_RAG_INDEX_PATH가 원천 데이터 작업 영역을 가리킵니다. 배포 서버에는 비식별 인덱스 파일만 올려야 합니다.',
      { path: redactLocalPath(ragPath, rootDir) },
    );
  } else {
    add('pass', 'aihub_rag_index_path_configured', 'AIHUB_RAG_INDEX_PATH가 설정되어 있습니다.', {
      path: redactLocalPath(ragPath, rootDir),
    });
  }

  if (ragPath && exists(ragPath)) {
    const validation = validateDeployableIndexFile(ragPath, readFile);
    if (validation.ok) {
      add('pass', 'deployable_rag_index_valid', '비식별 RAG 인덱스가 배포 검증을 통과했습니다.', {
        recordCount: validation.recordCount,
      });
    } else {
      add('fail', 'deployable_rag_index_invalid', '비식별 RAG 인덱스 검증에 실패했습니다.', {
        issueCount: validation.issueCount,
        reasons: validation.reasons,
      });
    }
  } else if (ragPath) {
    add('fail', 'aihub_rag_index_file_missing', 'AIHUB_RAG_INDEX_PATH 파일이 존재하지 않습니다.', {
      path: redactLocalPath(ragPath, rootDir),
    });
  }

  if (isTruthy(env.ALLOW_REMOTE_RAG_CONTEXT)) {
    add(
      'fail',
      'remote_rag_context_enabled',
      'ALLOW_REMOTE_RAG_CONTEXT가 켜져 있습니다. 발표/배포 기본값은 false로 두어 파생 RAG 컨텍스트 외부 전달을 제한합니다.',
    );
  } else {
    add('pass', 'remote_rag_context_disabled', 'ALLOW_REMOTE_RAG_CONTEXT가 꺼져 있습니다.');
  }

  if ((env.HOST || '') === '0.0.0.0') {
    add('pass', 'host_public_bind', 'HOST가 외부 접속 가능한 0.0.0.0으로 설정되어 있습니다.');
  } else {
    add('warn', 'host_not_public_bind', 'HOST가 0.0.0.0이 아닙니다. 로컬 발표 실행은 127.0.0.1로 충분하지만, VM/Nginx 배포에서는 0.0.0.0이 필요합니다.', {
      host: env.HOST || '',
    });
  }

  if ((env.NODE_ENV || '') === 'production') {
    add('pass', 'node_env_production', 'NODE_ENV가 production입니다.');
  } else {
    add('warn', 'node_env_not_production', 'NODE_ENV가 production이 아닙니다. 공개 서버 배포에서는 production을 권장합니다.', {
      nodeEnv: env.NODE_ENV || '',
    });
  }

  const failures = checks.filter((item) => item.status === 'fail');
  const warnings = checks.filter((item) => item.status === 'warn');

  return {
    ok: failures.length === 0,
    target: 'local-or-vm-runtime',
    checkedAt: new Date().toISOString(),
    checks,
    failures,
    warnings,
  };
}

export function readEnvFile(filePath, readFile = fs.readFileSync) {
  const env = {};
  const lines = readFile(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, '');
    if (key) env[key] = value;
  }
  return env;
}

function validateDeployableIndexFile(indexPath, readFile) {
  try {
    const parsed = JSON.parse(readFile(indexPath, 'utf8'));
    const validation = validateDeployableAihubRagIndex(parsed);
    return {
      ok: validation.ok,
      issueCount: validation.issueCount,
      reasons: [...new Set(validation.issues.map((issue) => issue.reason))],
      recordCount: Array.isArray(parsed.records) ? parsed.records.length : 0,
    };
  } catch (error) {
    return {
      ok: false,
      issueCount: 1,
      reasons: ['deployable_rag_index_parse_failed'],
      error: error.message,
      recordCount: 0,
    };
  }
}

function normalizeOptionalPath(filePath, rootDir) {
  if (!filePath) return '';
  return path.isAbsolute(filePath) ? filePath : path.resolve(rootDir, filePath);
}

function pointsToRawAihubArea(filePath) {
  return /(?:^|[/\\])aihub_71806(?:[/\\]|$)|(?:^|[/\\])api_download(?:[/\\]|$)|01\.원천데이터|02\.라벨링데이터/i.test(
    filePath,
  );
}

function isTruthy(value = '') {
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function redactLocalPath(filePath, rootDir) {
  if (!filePath) return '';
  const relative = path.relative(rootDir, filePath);
  if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) return relative;
  return filePath.replace(/\/Users\/[^/]+/g, '/Users/[user]');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const env = buildCliEnv(process.argv.slice(2));
  const result = runDeploymentPreflight({ env });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

function buildCliEnv(args) {
  const envFileFlagIndex = args.indexOf('--env-file');
  const explicitEnvFile = envFileFlagIndex >= 0 ? args[envFileFlagIndex + 1] : '';
  const defaultEnvFile = path.join(repoRoot, '.env');
  const envFile = explicitEnvFile || (fs.existsSync(defaultEnvFile) ? defaultEnvFile : '');
  const fileEnv = envFile && fs.existsSync(envFile) ? readEnvFile(path.resolve(envFile)) : {};
  return { ...fileEnv, ...process.env };
}
