# ZIP 다운로드 이후 Windows 실행 매뉴얼

이 문서는 GitHub ZIP과 비공개 패키지 ZIP을 이미 받은 뒤부터 따라 하는 절차입니다.

준비된 파일은 두 개입니다.

```text
medical-data-analysis-project-main.zip
psych-ai-private-runtime-package.zip
```

## 1. 두 ZIP 압축 풀기

두 ZIP 파일을 각각 우클릭한 뒤 `압축 풀기` 또는 `Extract All`을 선택합니다.

압축을 풀면 보통 아래 두 폴더가 생깁니다.

```text
medical-data-analysis-project-main/
private_runtime_package/
```

## 2. RAG 인덱스 복사

`private_runtime_package/app_data/aihub-rag-index.deploy.json` 파일을 찾습니다.

`medical-data-analysis-project-main` 폴더 안에 `app_data` 폴더를 새로 만들고, 그 안에 위 파일을 복사합니다.

완성 구조는 아래와 같아야 합니다.

```text
medical-data-analysis-project-main/
  app_data/
    aihub-rag-index.deploy.json
  public/
  src/
  test/
  package.json
```

복사가 끝나면 USB는 빼도 됩니다. 프로그램은 PC 안에 복사된 `app_data/aihub-rag-index.deploy.json`만 읽습니다.

## 3. `.env` 파일 만들기

`medical-data-analysis-project-main` 폴더 안에서 새 텍스트 파일을 만들고 이름을 정확히 `.env`로 바꿉니다.

메모장 저장 창에서는 `파일 형식`을 `모든 파일`로 바꾸고, 파일 이름을 `.env`로 저장해야 합니다. `.env.txt`가 되면 안 됩니다.

아래 내용을 넣고 `OPENAI_API_KEY=` 뒤에 본인의 OpenAI API key를 붙여 넣습니다.

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

## 4. PowerShell 열기

`medical-data-analysis-project-main` 폴더를 파일 탐색기로 엽니다.

상단 주소창을 클릭하고 `powershell`을 입력한 뒤 Enter를 누릅니다.

PowerShell 창이 열리면, 이미 프로젝트 폴더 안에서 명령을 실행할 준비가 된 상태입니다.

## 5. Node.js 설치 확인

PowerShell에 아래 명령을 입력합니다.

```bash
node -v
```

버전이 나오면 정상입니다. `node`가 인식되지 않는다고 나오면 https://nodejs.org/en/download 에서 Windows Installer로 Node.js 20 이상을 설치한 뒤 PowerShell을 새로 열어 다시 시도합니다.

## 6. 사전 점검

PowerShell에서 아래 명령을 실행합니다.

```bash
node src/deploymentPreflight.js
```

정상이라면 아래 항목들이 `pass`로 나옵니다.

- `openai_api_key_present`
- `aihub_rag_index_path_configured`
- `deployable_rag_index_valid`
- `remote_rag_context_disabled`

`HOST=127.0.0.1` 관련 경고는 로컬 발표 실행에서는 괜찮습니다.

## 7. 프로그램 실행

PowerShell에서 아래 명령을 실행합니다.

```bash
node src/server.js
```

서버가 켜진 동안 PowerShell 창을 닫지 않습니다.

브라우저를 열고 아래 주소로 접속합니다.

```text
http://localhost:5173
```

## 8. 종료 방법

발표나 테스트가 끝나면 서버가 실행 중인 PowerShell 창에서 `Ctrl+C`를 누릅니다.

`Terminate batch job (Y/N)?`가 나오면 `Y`를 입력하고 Enter를 누릅니다.

## 9. 테스트 후 삭제할 파일

전문가 PC 또는 발표 PC에 민감 파일을 남기지 않으려면 아래를 삭제합니다.

- `medical-data-analysis-project-main/.env`
- `medical-data-analysis-project-main/app_data/aihub-rag-index.deploy.json`
- `private_runtime_package/`

공개 GitHub 코드 폴더 자체는 남아 있어도 되지만, 위 세 가지는 삭제하는 것을 권장합니다.

## 자주 나는 문제

- API key가 없다고 나오면 `.env` 파일 위치와 파일명이 `.env.txt`가 아닌지 확인합니다.
- RAG 인덱스가 없다고 나오면 `app_data/aihub-rag-index.deploy.json` 위치를 확인합니다.
- 브라우저가 열리지 않으면 `node src/server.js`를 실행한 PowerShell 창이 아직 켜져 있는지 확인합니다.
- OpenAI 응답이 안 나오면 크레딧 잔액과 API key 삭제 여부를 확인합니다.
