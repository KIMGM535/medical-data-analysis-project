import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();

test('package exposes local preflight and USB package commands', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

  assert.equal(pkg.scripts['preflight:local'], 'node src/deploymentPreflight.js');
  assert.equal(pkg.scripts['preflight:kakao'], 'node src/deploymentPreflight.js');
  assert.equal(pkg.scripts['package:usb'], 'node src/privateRuntimePackage.js');
});

test('.env.example documents local presentation variables without secrets', () => {
  const envExample = fs.readFileSync(path.join(root, '.env.example'), 'utf8');

  assert.match(envExample, /HOST=127\.0\.0\.1/);
  assert.match(envExample, /AIHUB_RAG_INDEX_PATH=app_data\/aihub-rag-index\.deploy\.json/);
  assert.match(envExample, /ALLOW_REMOTE_RAG_CONTEXT=false/);
  assert.match(envExample, /CHAT_RATE_LIMIT_WINDOW_MS=600000/);
  assert.match(envExample, /CHAT_RATE_LIMIT_MAX=120/);
  assert.doesNotMatch(envExample, /sk-[A-Za-z0-9]/);
});

test('.gitignore blocks AIHub raw data, deployable private index, USB package, and local secrets', () => {
  const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');

  assert.match(gitignore, /^\.env$/m);
  assert.match(gitignore, /^app_data\/$/m);
  assert.match(gitignore, /^private_runtime_package\/$/m);
  assert.match(gitignore, /^aihub_71806\/$/m);
  assert.match(gitignore, /^aihub_71806\/api_download\/$/m);
  assert.match(gitignore, /^aihub_71806\/\*\*\/\*\.zip$/m);
  assert.match(gitignore, /^aihub_71806\/\*\*\/\*\.tar$/m);
});

test('KakaoCloud deployment templates route public traffic to the local Node server', () => {
  const nginx = fs.readFileSync(path.join(root, 'deploy', 'kakaocloud', 'nginx.conf'), 'utf8');
  const systemd = fs.readFileSync(path.join(root, 'deploy', 'kakaocloud', 'psychological-counseling-ai.service'), 'utf8');

  assert.match(nginx, /listen 80/);
  assert.match(nginx, /proxy_pass http:\/\/127\.0\.0\.1:5173/);
  assert.match(systemd, /EnvironmentFile=\/opt\/psych-ai\/\.env/);
  assert.match(systemd, /ExecStart=\/usr\/bin\/node src\/server\.js/);
  assert.doesNotMatch(nginx + systemd, /aihub_71806\/api_download|OPENAI_API_KEY=/);
});

test('GitHub Actions test workflow runs without private AIHub data', () => {
  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'test.yml'), 'utf8');

  assert.match(workflow, /actions\/setup-node/);
  assert.match(workflow, /node-version: 22/);
  assert.match(workflow, /node --test/);
  assert.doesNotMatch(workflow, /aihub_71806|app_data|OPENAI_API_KEY/);
});

test('local USB demo guide documents copy-based private index handoff', () => {
  const guide = fs.readFileSync(path.join(root, 'docs', 'local-usb-demo.md'), 'utf8');

  assert.match(guide, /USB는 실행 매체가 아니라 파일 전달 매체/);
  assert.match(guide, /app_data\/aihub-rag-index\.deploy\.json/);
  assert.match(guide, /https:\/\/nodejs\.org\/en\/download/);
  assert.match(guide, /https:\/\/platform\.openai\.com\/api-keys/);
  assert.match(guide, /http:\/\/localhost:5173/);
  assert.match(guide, /Ctrl\+C/);
  assert.doesNotMatch(guide, /sk-[A-Za-z0-9]/);
});
