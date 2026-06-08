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
  writeFile(path.join(outputDir, 'docs', 'github-code-linking.md'), buildGithubCodeLinkingGuide());
  writeFile(path.join(outputDir, 'checks', 'verification-commands.txt'), buildVerificationCommands());

  return {
    ok: true,
    outputDir,
    files: [
      path.relative(outputDir, targetIndexPath),
      '.env.template',
      'README-USB.md',
      'docs/github-code-linking.md',
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
    '- `docs/github-code-linking.md`: GitHub로 받은 코드와 USB 파일을 연결하는 상세 절차',
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

function buildGithubCodeLinkingGuide() {
  return [
    '# GitHub 코드와 USB 비공개 파일 연결 방법',
    '',
    '이 절차는 발표 PC 또는 전문가 테스트 PC에서 GitHub로 받은 공개 코드와 USB로 받은 비공개 RAG 인덱스를 연결하는 방법입니다.',
    '',
    '## Windows PC 준비물',
    '',
    '- Node.js 20 이상',
    '- Git 또는 GitHub ZIP 다운로드 가능 환경',
    '- 압축 해제 프로그램',
    '- OpenAI API key',
    '',
    'Windows에서 터미널은 `PowerShell`을 사용하면 됩니다. 프로젝트 폴더를 파일 탐색기로 연 뒤 주소창에 `powershell`을 입력하고 Enter를 누르면 해당 폴더에서 PowerShell이 열립니다.',
    '',
    '## 1. GitHub 코드 받기',
    '',
    'Git이 설치되어 있으면 터미널에서 실행합니다.',
    '',
    '```bash',
    'git clone https://github.com/KIMGM535/medical-data-analysis-project.git',
    'cd medical-data-analysis-project',
    '```',
    '',
    'Git을 사용할 수 없으면 GitHub 페이지에서 `Code > Download ZIP`을 눌러 내려받고 압축을 풉니다.',
    '',
    '## 2. USB 파일을 프로젝트 폴더로 복사',
    '',
    'USB 안의 아래 파일을 찾습니다.',
    '',
    '```text',
    'private_runtime_package/app_data/aihub-rag-index.deploy.json',
    '```',
    '',
    '이 파일을 GitHub에서 받은 프로젝트 폴더 안의 `app_data/` 폴더로 복사합니다. `app_data/` 폴더가 없으면 새로 만듭니다.',
    '',
    'Windows에서도 아래처럼 프로젝트 폴더 안에 복사해야 합니다. USB에 꽂힌 상태의 경로를 `.env`에 직접 넣지 않습니다.',
    '',
    '최종 구조는 아래와 같아야 합니다.',
    '',
    '```text',
    'medical-data-analysis-project/',
    '  app_data/',
    '    aihub-rag-index.deploy.json',
    '  public/',
    '  src/',
    '  test/',
    '  package.json',
    '  .env',
    '```',
    '',
    '복사가 끝나면 USB를 제거해도 됩니다. 프로그램은 USB가 아니라 PC 안에 복사된 `app_data/aihub-rag-index.deploy.json`을 읽습니다.',
    '',
    '## 3. `.env` 만들기',
    '',
    'USB 패키지의 `.env.template` 내용을 참고해 GitHub 프로젝트 폴더 안에 `.env` 파일을 만듭니다.',
    '',
    'Windows 메모장으로 만들 때는 저장 이름이 `.env.txt`가 되지 않게 주의합니다. 저장 창에서 파일 형식을 `모든 파일`로 바꾸고 파일 이름을 정확히 `.env`로 저장합니다.',
    '',
    '```env',
    'OPENAI_API_KEY=<OPENAI_API_KEY>',
    'OPENAI_MODEL=gpt-4.1-mini',
    'AIHUB_API_KEY=',
    'AIHUB_RAG_INDEX_PATH=app_data/aihub-rag-index.deploy.json',
    'ALLOW_REMOTE_RAG_CONTEXT=false',
    'HOST=127.0.0.1',
    'PORT=5173',
    'CHAT_RATE_LIMIT_WINDOW_MS=600000',
    'CHAT_RATE_LIMIT_MAX=120',
    '```',
    '',
    '`OPENAI_API_KEY`에는 본인이 발급받은 OpenAI API key를 직접 넣습니다. 이 값은 GitHub, USB, 메신저에 공유하지 않습니다.',
    '',
    '## 4. 연결 확인',
    '',
    '프로젝트 폴더에서 PowerShell을 열고 실행합니다.',
    '',
    '```bash',
    'node src/deploymentPreflight.js',
    '```',
    '',
    '정상이라면 `deployable_rag_index_valid`가 `pass`로 표시되고, `recordCount`가 1501로 나옵니다.',
    '',
    '## 5. 프로그램 실행',
    '',
    '```bash',
    'node src/server.js',
    '```',
    '',
    '브라우저에서 접속합니다.',
    '',
    '```text',
    'http://localhost:5173',
    '```',
    '',
    '## 6. 테스트 후 삭제',
    '',
    '대상 PC에 남기지 말아야 할 파일은 아래입니다.',
    '',
    '- `.env`',
    '- `app_data/aihub-rag-index.deploy.json`',
    '- `private_runtime_package/`',
    '',
    '## Windows에서 자주 나는 문제',
    '',
    '- `node`가 인식되지 않으면 Node.js가 설치되지 않았거나 PATH가 적용되지 않은 상태입니다. Node.js 설치 후 PowerShell을 새로 열어 다시 실행합니다.',
    '- `.env`를 만들었는데도 API key가 없다고 나오면 파일명이 `.env.txt`인지 확인합니다.',
    '- RAG 인덱스 파일이 없다고 나오면 `medical-data-analysis-project/app_data/aihub-rag-index.deploy.json` 위치에 복사됐는지 확인합니다.',
    '- 서버 실행 후 PowerShell 창을 닫으면 프로그램도 종료됩니다. 발표 중에는 `node src/server.js`가 실행 중인 PowerShell 창을 닫지 않습니다.',
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
    'Windows PC에서는 프로젝트 폴더를 파일 탐색기로 열고 주소창에 `powershell`을 입력하면 해당 폴더에서 PowerShell을 열 수 있습니다. `.env` 파일은 메모장에서 저장할 때 파일 형식을 `모든 파일`로 선택하고 이름을 정확히 `.env`로 저장합니다.',
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
