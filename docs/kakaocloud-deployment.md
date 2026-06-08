# KakaoCloud VM 배포 가이드

이 문서는 AIHub 원천 상담 데이터와 파생 RAG 인덱스를 공개 저장소에 올리지 않고, KakaoCloud VM 내부에서만 사용하는 발표/프로토타입 배포 절차입니다.

## 배포 구조

```text
GitHub 공개 저장소
  - 애플리케이션 코드
  - 테스트
  - 배포 템플릿
  - 문서

KakaoCloud VM 내부
  - /opt/psych-ai/.env
  - /opt/psych-ai/app_data/aihub-rag-index.deploy.json
  - 실행 중인 Node 서버
  - Nginx reverse proxy

사용자 브라우저
  - 공개 URL 접속
  - /api/chat 호출
  - 원천 데이터와 RAG 인덱스에는 직접 접근 불가
```

## 로컬에서 먼저 끝낼 준비

원천 AIHub 데이터는 로컬에만 두고, 서버에 올릴 비식별 RAG 인덱스를 생성합니다.

```bash
node src/aihubRagExport.js
node src/runAihubRagEvaluation.js
node --test
```

기본 출력 파일:

```text
app_data/aihub-rag-index.deploy.json
```

이 파일은 공개 GitHub에 올리지 않습니다. 발표용 VM에만 업로드합니다.

## 사용자가 마지막에 준비할 것

- KakaoCloud VM `kr-central-2` 생성
- Public IP 연결
- SSH 접속 가능 상태 확인
- OpenAI API key 준비
- 도메인을 쓸 경우 DNS 연결
- 비식별 RAG 인덱스 파일을 서버에 업로드할 수 있는 상태 확보

## 추천 VM 설정

- Region: `kr-central-2`
- OS: Ubuntu 22.04 또는 24.04
- Instance: 발표용 최소 `t1i.medium`
- Root volume: 30GB 이상
- Security group:
  - `22/tcp`: 본인 IP만 허용
  - `80/tcp`: 전체 허용
  - `443/tcp`: 도메인/HTTPS를 쓸 때 전체 허용

## 서버 초기 설정

```bash
sudo apt update
sudo apt install -y git nginx curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo useradd --system --create-home --home-dir /opt/psych-ai --shell /usr/sbin/nologin psychai
sudo mkdir -p /opt/psych-ai/current /opt/psych-ai/app_data
sudo chown -R psychai:psychai /opt/psych-ai
```

GitHub 저장소를 서버에 배치합니다.

```bash
sudo -u psychai git clone <GITHUB_REPO_URL> /opt/psych-ai/current
cd /opt/psych-ai/current
node --version
node --test
```

## 서버 환경변수

서버에는 `.env`를 직접 만듭니다. 이 파일은 GitHub에 올리지 않습니다.

```bash
sudo tee /opt/psych-ai/.env >/dev/null <<'EOF'
OPENAI_API_KEY=여기에_API_KEY
OPENAI_MODEL=gpt-4.1-mini
AIHUB_RAG_INDEX_PATH=/opt/psych-ai/app_data/aihub-rag-index.deploy.json
ALLOW_REMOTE_RAG_CONTEXT=false
NODE_ENV=production
HOST=0.0.0.0
PORT=5173
CHAT_RATE_LIMIT_WINDOW_MS=600000
CHAT_RATE_LIMIT_MAX=120
EOF
sudo chown psychai:psychai /opt/psych-ai/.env
sudo chmod 600 /opt/psych-ai/.env
```

## 비식별 RAG 인덱스 업로드

로컬에서 생성한 `app_data/aihub-rag-index.deploy.json`만 서버로 올립니다.

```bash
scp app_data/aihub-rag-index.deploy.json ubuntu@<PUBLIC_IP>:/tmp/aihub-rag-index.deploy.json
ssh ubuntu@<PUBLIC_IP>
sudo mv /tmp/aihub-rag-index.deploy.json /opt/psych-ai/app_data/aihub-rag-index.deploy.json
sudo chown psychai:psychai /opt/psych-ai/app_data/aihub-rag-index.deploy.json
sudo chmod 600 /opt/psych-ai/app_data/aihub-rag-index.deploy.json
```

서버에서 배포 전 점검을 실행합니다.

```bash
cd /opt/psych-ai/current
sudo -u psychai node src/deploymentPreflight.js --env-file /opt/psych-ai/.env
```

`ok: true`가 나와야 합니다.

## systemd 서비스 설치

```bash
sudo cp /opt/psych-ai/current/deploy/kakaocloud/psychological-counseling-ai.service /etc/systemd/system/psychological-counseling-ai.service
sudo systemctl daemon-reload
sudo systemctl enable psychological-counseling-ai
sudo systemctl start psychological-counseling-ai
sudo systemctl status psychological-counseling-ai --no-pager
```

서버 내부에서 확인합니다.

```bash
curl http://127.0.0.1:5173/api/health
```

## Nginx 연결

```bash
sudo cp /opt/psych-ai/current/deploy/kakaocloud/nginx.conf /etc/nginx/sites-available/psychological-counseling-ai
sudo ln -sf /etc/nginx/sites-available/psychological-counseling-ai /etc/nginx/sites-enabled/psychological-counseling-ai
sudo nginx -t
sudo systemctl reload nginx
```

외부에서 확인합니다.

```bash
curl http://<PUBLIC_IP>/api/health
```

브라우저에서 아래 주소로 접속합니다.

```text
http://<PUBLIC_IP>/
```

## 도메인과 HTTPS

도메인을 쓰는 경우 DNS A 레코드를 Public IP로 연결한 뒤 `deploy/kakaocloud/nginx.conf`의 `server_name _;`를 도메인으로 바꿉니다.

HTTPS는 Let’s Encrypt를 사용할 수 있습니다.

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d <DOMAIN>
```

## 발표 전 체크리스트

- `node --test` 통과
- `node src/runAihubRagEvaluation.js` 통과
- `node src/deploymentPreflight.js`에서 `ok: true`
- `curl http://127.0.0.1:5173/api/health` 응답
- `curl http://<PUBLIC_IP>/api/health` 응답
- 브라우저 첫 화면 로딩
- 일반 상담 입력 응답
- 자해/자살 위험 입력 안전 분기 응답
- RAG 인덱스가 없는 상태에서 graceful fallback 확인

## 발표 후 비용 정리

발표가 끝나면 과금을 멈추기 위해 리소스를 정리합니다.

- 계속 보관할 필요가 없으면 VM, Public IP, Volume 삭제
- 나중에 다시 켤 가능성이 있으면 VM을 `Shelved_offloaded` 상태로 전환하고 Public IP 과금 여부를 별도 확인
- `Stopped` 상태는 VM 과금이 계속될 수 있으므로 발표 후 방치하지 않습니다.

## 절대 하지 않을 것

- AIHub 원천 `.txt`, `.json`, `.zip`, `.tar`를 GitHub에 업로드하지 않습니다.
- `aihub_71806/api_download/`를 서버 공개 디렉터리에 두지 않습니다.
- `.env`와 API key를 GitHub에 올리지 않습니다.
- 브라우저에서 RAG 인덱스 파일을 직접 내려받을 수 있게 만들지 않습니다.
