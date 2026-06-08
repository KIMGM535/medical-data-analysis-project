# GitHub 공개 업로드 체크리스트

AIHub 71806 자료를 사용한 프로젝트는 코드 공개와 데이터 재배포를 분리해야 합니다.

## 공개 GitHub에 올릴 것

- `src/`
- `public/`
- `test/`
- `deploy/`
- `docs/`
- `README.md`
- `package.json`
- `.env.example`
- `.gitignore`
- `.github/workflows/test.yml`
- `render.yaml`

## 공개 GitHub에 올리지 않을 것

- `aihub_71806/`
- `app_data/`
- `private_runtime_package/`
- `.env`
- AIHub 원천 `.txt`, `.json`
- AIHub 다운로드 `.zip`, `.tar`
- `aihub-rag-index.deploy.json`
- API key, 쿠키, 세션 파일, 헤더 파일

## 업로드 전 로컬 검증

```bash
node --test
node src/aihubRagExport.js
node src/privateRuntimePackage.js
node src/runAihubRagEvaluation.js
env NODE_ENV=production HOST=0.0.0.0 PORT=5173 OPENAI_API_KEY=test-openai-key OPENAI_MODEL=gpt-4.1-mini AIHUB_RAG_INDEX_PATH=app_data/aihub-rag-index.deploy.json ALLOW_REMOTE_RAG_CONTEXT=false node src/deploymentPreflight.js
```

`deploymentPreflight`는 실제 서버에서는 `OPENAI_API_KEY=test-openai-key` 대신 실제 키를 사용합니다.

## GitHub 업로드 전 직접 확인

```bash
git status --short
```

아래 경로가 보이면 커밋하지 않습니다.

```text
aihub_71806/
app_data/
private_runtime_package/
.env
```

이 프로젝트 폴더가 아직 Git 저장소가 아니라면 먼저 `git init` 후 `.gitignore`가 적용되는지 확인합니다. GitHub 웹 UI로 드래그 업로드하는 방식은 `.gitignore` 보호를 우회할 수 있으므로 사용하지 않습니다.

## 업로드 후 확인

GitHub Actions의 `test` 워크플로가 `node --test`를 실행합니다. 공개 저장소에는 AIHub 원천 데이터가 없으므로, 이 CI가 통과해야 다른 PC에서도 코드만으로 기본 실행 가능하다고 볼 수 있습니다.

## 공개 저장소 README에 명시할 문구

```text
본 프로젝트는 AIHub 71806 심리상담 데이터의 다운로드 승인 자료를 로컬/비공개 서버 환경에서만 사용합니다. 공개 저장소에는 AIHub 원천 데이터, 파생 RAG 인덱스, API key, 쿠키, 세션 파일을 포함하지 않습니다.
```

## 발표/전문가 테스트 배포 방식

공개 GitHub에는 코드만 올리고, 비식별 RAG 인덱스는 `node src/privateRuntimePackage.js`로 만든 `private_runtime_package/` 폴더를 USB에 복사해 대상 PC로 전달합니다. 대상 PC에서는 USB의 `app_data/aihub-rag-index.deploy.json`을 프로젝트 폴더의 `app_data/` 안으로 복사한 뒤 USB를 제거하고 로컬 서버를 실행합니다. 자세한 절차는 `docs/local-usb-demo.md`를 따릅니다.
