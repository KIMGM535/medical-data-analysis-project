import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDeployableAihubRagIndex } from './aihubRag.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, '..');
const defaultIndexPath = path.join(repoRoot, 'app_data', 'aihub-rag-index.deploy.json');
const defaultOutputDir = path.join(repoRoot, 'private_runtime_package');

export function createPrivateRuntimePackage({
  indexPath = defaultIndexPath,
  outputDir = defaultOutputDir,
  readFile = fs.readFileSync,
  writeFile = fs.writeFileSync,
  mkdir = fs.mkdirSync,
  copyFile = fs.copyFileSync,
  exists = fs.existsSync,
  rm = fs.rmSync,
} = {}) {
  if (!exists(indexPath)) {
    return {
      ok: false,
      error: 'rag_index_missing',
      indexPath,
      outputDir,
    };
  }

  const parsed = JSON.parse(readFile(indexPath, 'utf8'));
  const validation = validateDeployableAihubRagIndex(parsed);
  if (!validation.ok) {
    return {
      ok: false,
      error: 'rag_index_validation_failed',
      issueCount: validation.issueCount,
      reasons: [...new Set(validation.issues.map((issue) => issue.reason))],
      indexPath,
      outputDir,
    };
  }

  if (exists(outputDir)) rm(outputDir, { recursive: true, force: true });
  mkdir(path.join(outputDir, 'app_data'), { recursive: true });
  mkdir(path.join(outputDir, 'docs'), { recursive: true });
  mkdir(path.join(outputDir, 'checks'), { recursive: true });

  const targetIndexPath = path.join(outputDir, 'app_data', 'aihub-rag-index.deploy.json');
  copyFile(indexPath, targetIndexPath);

  writeFile(path.join(outputDir, '.env.template'), buildEnvTemplate());
  writeFile(path.join(outputDir, 'README-USB.md'), buildUsbReadme());
  writeFile(path.join(outputDir, 'docs', 'presentation-pc-setup.md'), buildPresentationSetupGuide());
  writeFile(path.join(outputDir, 'checks', 'verification-commands.txt'), buildVerificationCommands());

  return {
    ok: true,
    outputDir,
    files: [
      path.relative(outputDir, targetIndexPath),
      '.env.template',
      'README-USB.md',
      'docs/presentation-pc-setup.md',
      'checks/verification-commands.txt',
    ],
    recordCount: Array.isArray(parsed.records) ? parsed.records.length : 0,
  };
}

function buildEnvTemplate() {
  return [
    'OPENAI_API_KEY=',
    'OPENAI_MODEL=gpt-4.1-mini',
    'AIHUB_API_KEY=',
    'AIHUB_RAG_INDEX_PATH=app_data/aihub-rag-index.deploy.json',
    'ALLOW_REMOTE_RAG_CONTEXT=false',
    'HOST=127.0.0.1',
    'PORT=5173',
    'CHAT_RATE_LIMIT_WINDOW_MS=600000',
    'CHAT_RATE_LIMIT_MAX=120',
    '',
  ].join('\n');
}

function buildUsbReadme() {
  return [
    '# 발표/전문가 테스트용 비공개 런타임 패키지',
    '',
    '이 폴더는 GitHub에 올리지 않는 비공개 실행 자료입니다.',
    '',
    '## 포함 파일',
    '',
    '- `app_data/aihub-rag-index.deploy.json`: AIHub 원천 데이터를 비식별 요약/신호 형태로 변환한 RAG 인덱스',
    '- `.env.template`: 발표 PC에서 `.env`를 만들 때 쓰는 예시',
    '- `docs/presentation-pc-setup.md`: GitHub 코드와 이 패키지를 연결하는 절차',
    '- `checks/verification-commands.txt`: 발표 전 점검 명령어',
    '',
    '## 사용 원칙',
    '',
    '- USB는 실행 매체가 아니라 파일 전달 매체입니다.',
    '- 대상 PC에 필요한 파일을 복사한 뒤 USB는 제거해도 됩니다.',
    '- `OPENAI_API_KEY`는 이 패키지에 넣지 않습니다.',
    '- AIHub 원천 상담 `.txt`, 라벨 `.json`, ZIP/TAR 파일은 이 패키지에 포함하지 않습니다.',
    '',
  ].join('\n');
}

function buildPresentationSetupGuide() {
  return [
    '# 발표 PC 로컬 실행 절차',
    '',
    '1. GitHub에서 프로젝트 코드를 다운로드합니다.',
    '2. 이 USB 패키지의 `app_data/aihub-rag-index.deploy.json`을 프로젝트 폴더의 `app_data/` 안으로 복사합니다.',
    '3. 프로젝트 폴더에서 `.env.template`을 참고해 `.env` 파일을 만듭니다.',
    '4. `.env`의 `OPENAI_API_KEY=` 뒤에 본인 OpenAI API key를 입력합니다.',
    '5. 터미널에서 `node src/deploymentPreflight.js`를 실행해 사전 점검합니다.',
    '6. 터미널에서 `node src/server.js`를 실행합니다.',
    '7. 브라우저에서 `http://localhost:5173`에 접속합니다.',
    '',
    '## 권장 폴더 구조',
    '',
    '```text',
    'Psychological Counseling AI/',
    '  app_data/',
    '    aihub-rag-index.deploy.json',
    '  public/',
    '  src/',
    '  test/',
    '  package.json',
    '  .env',
    '```',
    '',
    '발표가 끝나면 대상 PC의 `.env` 파일과 `app_data/aihub-rag-index.deploy.json`을 삭제합니다.',
    '',
  ].join('\n');
}

function buildVerificationCommands() {
  return [
    'node --test',
    'node src/deploymentPreflight.js',
    'node src/server.js',
    '',
    '브라우저 접속 주소:',
    'http://localhost:5173',
    '',
  ].join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const indexPath = process.argv[2] ? path.resolve(process.argv[2]) : defaultIndexPath;
  const outputDir = process.argv[3] ? path.resolve(process.argv[3]) : defaultOutputDir;
  const result = createPrivateRuntimePackage({ indexPath, outputDir });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
