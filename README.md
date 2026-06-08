# Psychological Counseling AI

AIHub 71806 심리상담 데이터 설명, 교육 영상 메모, 가상 사용자 시뮬레이션, 안전 분기 규칙을 기반으로 만든 한국어 심리상담 보조 프로토타입입니다.

## 기능

- 칼 로저스식 인간중심 상담 톤을 우선하는 대화 흐름
- 누적 대화 기반 상태 가능성, 강도, 조치, 상담 세션 제안
- 다운로드 승인된 AIHub 원천 상담 전사/라벨 데이터의 로컬 집계 반영
- AIHub 라벨/요약 기반 로컬 RAG 검색 근거를 상담 응답과 요약 보고서에 반영
- 실제 상담사 발화 패턴과 로저스식 개입 라벨을 상담 근거 컨텍스트에 반영
- 원문을 노출하지 않는 사용자용/상담자 검토용 상담 요약 보고서와 보호/개선 요인 요약 생성
- 자살 위험, 자해, 현재 폭력, 아동학대, 섭식 응급, 알코올 금단, 산후 정신증 등 안전 분기
- 가상 상담 사용자 시뮬레이션과 자동 평가
- OpenAI API 키가 있으면 LLM 응답 사용, 없으면 데모 규칙 기반 응답 사용

## 로컬 실행

```bash
node src/server.js
```

기본 주소:

```text
http://localhost:5173
```

환경변수는 `.env.example`을 참고해 `.env`에 설정합니다. 발표/전문가 PC에서는 USB로 받은 비공개 RAG 인덱스를 프로젝트 폴더의 `app_data/`에 복사한 뒤 아래처럼 연결합니다.

```bash
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
AIHUB_API_KEY=
AIHUB_RAG_INDEX_PATH=app_data/aihub-rag-index.deploy.json
ALLOW_REMOTE_RAG_CONTEXT=false
HOST=127.0.0.1
PORT=5173
```

## 검증

```bash
node --test
node src/runSimulationReport.js
node src/aihubRagExport.js
node src/runAihubRagEvaluation.js
node src/deploymentPreflight.js
node --check src/server.js
node --check src/counselor.js
node --check src/simulation.js
```

현재 기준:

- 단위/통합 테스트는 `node --test`로 실행
- 가상 사용자 시뮬레이션 39명, 76턴, RAG 매칭 44턴
- 배포용 비식별 RAG 인덱스 1,501건 생성 및 유출 검증 0건
- 로컬 원천 RAG와 배포용 RAG parity 평가 8개 시나리오 top condition/query feature 일치율 100%
- 자세한 보고서: `docs/virtual-counseling-simulation-report.md`

## AIHub 원천 데이터

AIHub 71806의 `파일 목록(API 다운로드)`에서 받은 `download.tar`는 로컬에서만 사용합니다. 현재 로컬 기준으로 원천 상담 전사 `.txt` 1,501개와 라벨 `.json` 1,501개가 매칭되어 있으며, 앱은 이 원문을 공개하지 않고 집계된 상담사 스타일 프로필과 라벨/요약/전사 신호 지문 기반 RAG 인덱스만 사용합니다. RAG 인덱스도 메모리에서 생성되며 원문 대화, 파일명, 사례 ID를 사용자 응답에 노출하지 않는 것을 원칙으로 합니다. RAG 조건 분포는 `ANXIETY` 같은 내부 코드 대신 `불안 관련` 같은 공개용 한국어 표시값으로 보여줍니다. 수면처럼 특정 질환 신호가 약한 입력은 한 조건으로만 몰리지 않도록 후보 조건을 분산해 상담자가 성급한 가설을 세우지 않게 했습니다. 타인의 자살·사망 소식처럼 애도 맥락이 분명하고 사용자 본인의 자해 의도가 없는 경우에는 공개 RAG 분포를 `상실/애도 관련`으로 묶고, 성폭력·학대·해리감 같은 트라우마 맥락은 `트라우마 반응 관련`으로 묶어 오해를 줄입니다. RAG 검색은 최근 사용자 발화 6개까지의 비공개 검색 텍스트를 사용해, 트라우마 공개 뒤 몇 턴이 지나도 근거 요약이 최신 짧은 문장만 보고 흔들리지 않게 했습니다.

- 원천 데이터 작업 폴더: `aihub_71806/api_download/`
- AIHub RAG 설계 문서: `docs/aihub-rag-design.md`
- 상담사 스타일 학습 보고서: `docs/counselor-style-learning-report.md`
- GitHub/배포물에는 `aihub_71806/`, 원천 데이터, ZIP, TAR, 비공개 RAG 인덱스를 포함하지 않습니다.
- 공개 배포 코드에 `aihub_71806/`가 없어도 앱은 기본 메타데이터 fallback으로 시작되며, 발표 PC나 비공개 서버의 `AIHUB_RAG_INDEX_PATH`가 설정되면 비식별 RAG 인덱스를 사용합니다.

### 배포용 비식별 RAG 인덱스

원천 데이터는 로컬에만 두고, 발표 PC나 비공개 서버에는 파생 인덱스만 복사하는 것을 기본 배포 전략으로 둡니다.

```bash
node src/aihubRagExport.js
node src/runAihubRagEvaluation.js
```

기본 출력 위치는 `.gitignore`된 `app_data/aihub-rag-index.deploy.json`입니다. 이 파일에는 원천 전사, 원천 파일명, 로컬 경로, case key를 포함하지 않고 `condition`, 진단 점수, 내담자 라벨, 상담사 개입 라벨, 전사 신호 카운트, 비식별 요약, 검색 텍스트만 포함합니다.

로컬 발표/전문가 테스트 환경에서 원천 데이터 없이 이 인덱스를 사용하려면 환경변수에 경로를 지정합니다.

```bash
AIHUB_RAG_INDEX_PATH=app_data/aihub-rag-index.deploy.json
```

## USB 비공개 패키지 방식

발표와 전문가 테스트의 기본 전략은 GitHub에는 공개 가능한 코드와 문서만 올리고, 비공개 RAG 인덱스는 USB로 대상 PC에 복사하는 방식입니다. USB는 실행 매체가 아니라 파일 전달 매체입니다. 대상 PC에 `app_data/aihub-rag-index.deploy.json`을 복사한 뒤 USB는 제거해도 됩니다.

현재 로컬에 생성된 비식별 RAG 인덱스를 USB 전달용 폴더로 묶으려면 다음 명령을 실행합니다.

```bash
node src/privateRuntimePackage.js
```

또는 package script를 사용합니다.

```bash
npm run package:usb
```

출력 위치는 `.gitignore`된 `private_runtime_package/`입니다.

대상 PC의 핵심 환경변수:

```bash
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
AIHUB_RAG_INDEX_PATH=app_data/aihub-rag-index.deploy.json
ALLOW_REMOTE_RAG_CONTEXT=false
HOST=127.0.0.1
PORT=5173
CHAT_RATE_LIMIT_WINDOW_MS=600000
CHAT_RATE_LIMIT_MAX=120
```

배포 전 점검:

```bash
node src/deploymentPreflight.js
```

헬스 체크:

```bash
curl http://127.0.0.1:5173/api/health
```

세부 절차는 `docs/local-usb-demo.md`를 따릅니다.

공개 GitHub 업로드 전에는 `docs/github-publication-checklist.md`를 확인합니다.

## 서버 VM 배포

KakaoCloud/AWS 같은 VM 서버 배포가 필요해지면 비식별 RAG 인덱스와 `.env`를 서버 내부에만 두고, GitHub에는 코드와 문서만 올리는 원칙을 유지합니다. `deploy/kakaocloud/`에는 Linux VM에서 재사용 가능한 Nginx reverse proxy와 systemd 서비스 템플릿이 들어 있습니다. 기존 KakaoCloud 문서는 `docs/kakaocloud-deployment.md`에 남겨두되, 발표용 기본 경로는 `docs/local-usb-demo.md`입니다.

## Render 배포 참고

이 저장소에는 초기 프로토타입용 `render.yaml`이 포함되어 있습니다. 다만 AIHub 파생 RAG 인덱스를 비공개로 보관해야 하는 발표 시나리오에서는 로컬/USB 방식 또는 별도 VM 서버 방식을 우선합니다.

- Runtime: Node
- Start command: `node src/server.js`
- `HOST=0.0.0.0`
- `OPENAI_API_KEY`는 Render 환경변수에 직접 등록
- `AIHUB_RAG_INDEX_PATH`를 설정하지 않으면 원천 데이터 없는 데모/규칙 기반 fallback으로 동작합니다.

## 주의

이 앱은 확정 진단이나 치료를 대신하지 않습니다. 상담 보조, 위험 신호 정리, 안전 연결, 전문가 도움 권고를 목적으로 합니다. 실제 운영 전에는 개인정보 처리, 상담 기록 저장 정책, 임상 전문가 검토, 긴급상황 대응 절차를 별도로 마련해야 합니다.
