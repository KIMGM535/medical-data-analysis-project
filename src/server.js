import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createCounselingTurn } from './counselor.js';
import { loadConfig } from './config.js';
import { loadAihubRawDatasetSummary } from './aihubRawDataset.js';
import { buildAihubRagContext, loadAihubRagIndex, loadDeployableAihubRagIndex, summarizeAihubRagIndex } from './aihubRag.js';
import { buildCounselorStyleGuidance, loadCounselorStyleProfile } from './counselorStyle.js';
import { loadAihubInventory, loadTrainingVideoNotes, summarizeTrainingVideoNotes } from './knowledge.js';
import { generateWithOpenAI } from './llm.js';
import { toPublicDataStatus } from './status.js';
import { buildHealthPayload } from './health.js';
import { createRateLimiter } from './rateLimit.js';

const config = loadConfig();
const publicDir = path.join(config.repoRoot, 'public');
const inventory = loadAihubInventory();
const trainingVideoNotes = loadTrainingVideoNotes();
const rawDatasetSummary = loadAihubRawDatasetSummary();
const counselorStyleProfile = loadCounselorStyleProfile();
const aihubRagIndex = config.aihubRagIndexPath ? loadDeployableAihubRagIndex(config.aihubRagIndexPath) : loadAihubRagIndex();
const chatRateLimiter = createRateLimiter({
  windowMs: config.chatRateLimitWindowMs,
  maxRequests: config.chatRateLimitMax,
});

const server = http.createServer(async (request, response) => {
  try {
    const requestPath = new URL(request.url, `http://${request.headers.host || 'localhost'}`).pathname;

    if (request.method === 'OPTIONS' && requestPath.startsWith('/api/')) {
      return sendEmpty(response, 204);
    }

    if (request.method === 'GET' && requestPath === '/api/status') {
      return sendJson(response, {
        ok: true,
        openaiConfigured: Boolean(config.openaiApiKey),
        aihubConfigured: Boolean(config.aihubApiKey),
        data: {
          datasetSn: inventory.datasetSn,
          fileCount: inventory.files.length,
          rawDatasetAccess: rawDatasetSummary.available ? 'downloaded and indexed locally' : 'requires AIHub login/download approval',
          rawDataset: toPublicDataStatus(rawDatasetSummary),
          aihubRag: toPublicDataStatus(summarizeAihubRagIndex(aihubRagIndex)),
          counselorStyle: toPublicDataStatus(counselorStyleProfile),
          counselorStyleGuidance: buildCounselorStyleGuidance(counselorStyleProfile),
          trainingVideo: summarizeTrainingVideoNotes(trainingVideoNotes),
        },
      });
    }

    if (request.method === 'GET' && requestPath === '/api/health') {
      return sendJson(response, buildHealthPayload({ config, aihubRagIndex }));
    }

    if (request.method === 'POST' && requestPath === '/api/chat') {
      const rate = chatRateLimiter.check(clientKey(request));
      if (!rate.allowed) {
        return sendJson(
          response,
          {
            error: 'rate_limited',
            message: '요청이 잠시 많습니다. 잠깐 뒤 다시 시도해주세요.',
            retryAfterSeconds: rate.retryAfterSeconds,
          },
          429,
          { 'Retry-After': String(rate.retryAfterSeconds) },
        );
      }

      const body = await readJson(request);
      const turn = await createCounselingTurn({
        messages: body.messages,
        mode: body.mode,
        inventory,
        trainingVideoNotes,
        rawDatasetSummary,
        counselorStyleProfile,
        aihubRagProvider: (messages) => buildAihubRagContext(aihubRagIndex, { messages }),
        allowPrivateRagInLlmPrompt: config.allowRemoteRagContext,
        llmClient: config.openaiApiKey
          ? (prompt) =>
              generateWithOpenAI({
                apiKey: config.openaiApiKey,
                model: config.openaiModel,
                messages: buildOpenAIInput(prompt),
                responseSchema: counselingSchema(),
              })
          : undefined,
        openai: { model: config.openaiModel },
      });
      return sendJson(response, turn);
    }

    if (request.method === 'GET' || request.method === 'HEAD') {
      return serveStatic(request, response, requestPath);
    }

    sendJson(response, { error: 'method_not_allowed' }, 405);
  } catch (error) {
    sendJson(response, { error: 'server_error', message: error.message }, 500);
  }
});

server.listen(config.port, config.host, () => {
  console.log(`Psychological Counseling AI running at http://${config.host}:${config.port}`);
});

function serveStatic(request, response, requestPath) {
  const urlPath = requestPath === '/' ? '/index.html' : requestPath;
  const normalized = path.normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(publicDir, normalized);

  if (!filePath.startsWith(publicDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return sendText(response, 'Not found', 404, 'text/plain; charset=utf-8', request.method === 'HEAD');
  }

  const type = contentType(filePath);
  sendText(response, fs.readFileSync(filePath), 200, type, request.method === 'HEAD');
}

function sendJson(response, data, status = 200, extraHeaders = {}) {
  response.writeHead(status, corsHeaders({ 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders }));
  response.end(JSON.stringify(data));
}

function sendText(response, data, status = 200, type = 'text/plain; charset=utf-8', omitBody = false) {
  response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  response.end(omitBody ? undefined : data);
}

function sendEmpty(response, status = 204) {
  response.writeHead(status, corsHeaders());
  response.end();
}

function corsHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    ...extra,
  };
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error('request_too_large'));
      }
    });
    request.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('invalid_json'));
      }
    });
    request.on('error', reject);
  });
}

function contentType(filePath) {
  const ext = path.extname(filePath);
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.js') return 'text/javascript; charset=utf-8';
  if (ext === '.png') return 'image/png';
  return 'application/octet-stream';
}

function buildOpenAIInput(prompt) {
  return [
    {
      role: 'system',
      content:
        'You are a Korean psychological counseling assistant. Follow the responseStyle field exactly: person-centered reflection first, no diagnosis or prescription, one open question at a time, and never expose AIHub raw text, personal data, file names, case IDs, or label names to the user.',
    },
    {
      role: 'user',
      content: JSON.stringify(prompt),
    },
  ];
}

function clientKey(request) {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return request.socket.remoteAddress || 'unknown';
}

function counselingSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      assistantMessage: { type: 'string' },
      actions: { type: 'array', items: { type: 'string' } },
      session: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          focus: { type: 'string' },
          steps: { type: 'array', items: { type: 'string' } },
        },
        required: ['title', 'focus', 'steps'],
      },
    },
    required: ['assistantMessage', 'actions', 'session'],
  };
}
