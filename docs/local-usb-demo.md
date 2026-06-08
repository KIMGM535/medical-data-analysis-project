# 발표/전문가 PC 로컬 실행 매뉴얼

이 문서는 공개 GitHub 코드와 USB로 전달한 비공개 RAG 인덱스를 연결해, 발표 PC 또는 전문가 테스트 PC에서 로컬로 상담 AI를 실행하는 절차입니다.

## 배포 원칙

- GitHub에는 프로그램 코드와 문서만 올립니다.
- AIHub 원천 데이터, `.env`, OpenAI API key, 쿠키, 세션 파일, 비공개 RAG 인덱스는 GitHub에 올리지 않습니다.
- USB는 실행 매체가 아니라 파일 전달 매체입니다.
- 대상 PC에 필요한 파일을 복사한 뒤 USB는 제거해도 됩니다.
- 대상 PC에서는 `http://localhost:5173` 로 접속해 로컬 실행 앱을 사용합니다.

## 전체 흐름

```text
GitHub 공개 코드 다운로드
→ USB의 비식별 RAG 인덱스 복사
→ .env 작성
→ 사전 점검
→ Node 서버 실행
→ http://localhost:5173 접속
```

## 1. GitHub에서 코드 받기

먼저 발표 PC에 Node.js 20 이상이 필요합니다. Windows에서는 공식 다운로드 페이지에서 Windows Installer를 설치합니다.

```text
https://nodejs.org/en/download
```

설치 후 PowerShell을 새로 열고 아래 명령으로 확인합니다.

```bash
node -v
```

대상 PC에서 Git이 가능하면 다음 명령을 사용합니다.

```bash
git clone https://github.com/KIMGM535/medical-data-analysis-project.git
cd medical-data-analysis-project
```

Git을 사용할 수 없으면 GitHub 페이지에서 `Code > Download ZIP`으로 내려받아 압축을 풉니다.

## 2. USB 비공개 패키지 복사

USB 안의 `private_runtime_package/app_data/aihub-rag-index.deploy.json` 파일을 프로젝트 폴더 안의 `app_data/`로 복사합니다.

권장 결과:

```text
medical-data-analysis-project/
  app_data/
    aihub-rag-index.deploy.json
  public/
  src/
  test/
  package.json
```

`app_data/` 폴더가 없으면 새로 만듭니다.

## 3. `.env` 작성

프로젝트 폴더에 `.env` 파일을 만들고 아래 내용을 넣습니다.

OpenAI API key는 아래 페이지에서 발급한 값을 사용합니다.

```text
https://platform.openai.com/api-keys
```

```env
OPENAI_API_KEY=<OPENAI_API_KEY>
OPENAI_MODEL=gpt-4.1-mini
AIHUB_API_KEY=
AIHUB_RAG_INDEX_PATH=app_data/aihub-rag-index.deploy.json
ALLOW_REMOTE_RAG_CONTEXT=false
HOST=127.0.0.1
PORT=5173
CHAT_RATE_LIMIT_WINDOW_MS=600000
CHAT_RATE_LIMIT_MAX=120
```

`AIHUB_API_KEY`는 발표 실행에는 비워둬도 됩니다. 이미 비식별 RAG 인덱스를 복사해 사용하기 때문입니다.

## 4. 사전 점검

```bash
node src/deploymentPreflight.js
```

정상 조건:

- `OPENAI_API_KEY`가 설정되어 있어야 합니다.
- `AIHUB_RAG_INDEX_PATH` 파일이 존재해야 합니다.
- 비식별 RAG 인덱스 검증이 통과해야 합니다.
- `ALLOW_REMOTE_RAG_CONTEXT=false`여야 합니다.

`HOST=127.0.0.1`은 로컬 발표 실행에 적합합니다. 사전 점검에서 서버 배포용 경고가 나와도 실패가 아니라면 로컬 시연은 가능합니다.

## 5. 실행

```bash
node src/server.js
```

터미널에 다음과 비슷한 문구가 나오면 실행 중입니다.

```text
Psychological Counseling AI running at http://127.0.0.1:5173
```

브라우저에서 아래 주소로 접속합니다.

```text
http://localhost:5173
```

서버를 종료하려면 터미널 또는 PowerShell에서 `Ctrl+C`를 누릅니다. Windows에서 `Terminate batch job (Y/N)?`가 나오면 `Y`를 입력하고 Enter를 누릅니다.

## 6. 발표/테스트 후 삭제

대상 PC에 남기지 말아야 할 파일:

- `.env`
- `app_data/aihub-rag-index.deploy.json`
- `private_runtime_package/`

프로젝트 코드 자체는 공개 GitHub 코드이므로 남아 있어도 되지만, 위 세 가지는 발표/테스트 후 삭제하는 것을 권장합니다.

## 문제 해결

`node: command not found`가 나오면 Node.js가 설치되어 있지 않은 상태입니다.

`OPENAI_API_KEY가 없습니다`가 나오면 `.env` 파일에 OpenAI API key를 입력했는지 확인합니다.

`AIHUB_RAG_INDEX_PATH 파일이 존재하지 않습니다`가 나오면 `app_data/aihub-rag-index.deploy.json` 위치를 확인합니다.

브라우저가 열리지 않으면 터미널에서 서버가 계속 실행 중인지 확인하고 `http://127.0.0.1:5173`으로 접속합니다.
