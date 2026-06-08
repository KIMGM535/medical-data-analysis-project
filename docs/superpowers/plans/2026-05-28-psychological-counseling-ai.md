# Psychological Counseling AI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local webapp MVP that provides LLM-backed psychological counseling support, possibility classification, severity/risk assessment, and guided intervention sessions.

**Architecture:** Use a dependency-light Node.js app with a small HTTP API and static frontend. Safety and rule-based demo behavior live in pure JS modules so tests can run without network or API keys. OpenAI integration is optional and isolated behind an adapter.

**Tech Stack:** Node.js built-in `http`, vanilla HTML/CSS/JS, Node built-in test runner, local AIHub files under `aihub_71806/`.

---

## File Structure

- `package.json`: scripts for server and tests.
- `.gitignore`: excludes `.env`, generated indexes, and local runtime clutter.
- `.env.example`: documents expected API keys.
- `src/config.js`: environment loading and constants.
- `src/knowledge.js`: loads AIHub inventory and builds concise knowledge context.
- `src/safety.js`: crisis detection, diagnosis-language filtering, severity/risk scoring.
- `src/counselor.js`: orchestrates counseling response, demo mode, and optional LLM adapter.
- `src/llm.js`: optional OpenAI Responses API adapter.
- `src/server.js`: Node HTTP API and static file server.
- `public/index.html`: main app shell.
- `public/styles.css`: operational dashboard styling.
- `public/app.js`: chat interaction and panel rendering.
- `test/*.test.js`: behavior tests for safety, knowledge loading, and counselor output.

## Task 1: Project Shell

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `.env.example`

- [ ] **Step 1: Write project metadata and scripts**

Create `package.json`:

```json
{
  "name": "psychological-counseling-ai",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node src/server.js",
    "test": "node --test"
  }
}
```

- [ ] **Step 2: Add ignored files**

Create `.gitignore`:

```gitignore
.env
node_modules/
.DS_Store
app_data/
```

- [ ] **Step 3: Add environment example**

Create `.env.example`:

```bash
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
AIHUB_API_KEY=
PORT=5173
```

## Task 2: Safety Core

**Files:**
- Create: `src/safety.js`
- Test: `test/safety.test.js`

- [ ] **Step 1: Write failing tests**

Create tests asserting crisis escalation, normal stress handling, diagnosis wording removal, and category scoring.

- [ ] **Step 2: Run tests**

Run: `npm test`

Expected: FAIL because `src/safety.js` does not exist yet.

- [ ] **Step 3: Implement safety module**

Implement:

- `detectCrisis(text)`
- `estimateSeverity(text)`
- `estimateConditions(text)`
- `sanitizeClinicalLanguage(text)`
- `buildSafetyNotice(level)`

- [ ] **Step 4: Run tests**

Run: `npm test`

Expected: PASS for safety tests.

## Task 3: AIHub Knowledge Loader

**Files:**
- Create: `src/knowledge.js`
- Test: `test/knowledge.test.js`

- [ ] **Step 1: Write failing tests**

Test that `aihub_71806/s3_file_list_normalized.json` loads 150 files and exposes disease/file split summaries.

- [ ] **Step 2: Run tests**

Run: `npm test`

Expected: FAIL because `src/knowledge.js` does not exist yet.

- [ ] **Step 3: Implement knowledge loader**

Implement:

- `loadAihubInventory(baseDir)`
- `summarizeInventory(inventory)`
- `buildKnowledgeContext(inventory)`

- [ ] **Step 4: Run tests**

Run: `npm test`

Expected: PASS for knowledge tests.

## Task 4: Counselor Orchestrator

**Files:**
- Create: `src/counselor.js`
- Create: `src/llm.js`
- Test: `test/counselor.test.js`

- [ ] **Step 1: Write failing tests**

Test demo-mode counseling output includes the four required functions: response, condition likelihoods, severity, and recommended actions.

- [ ] **Step 2: Run tests**

Run: `npm test`

Expected: FAIL because `src/counselor.js` does not exist yet.

- [ ] **Step 3: Implement counselor**

Implement:

- `createCounselingTurn({ messages, mode, inventory, llmClient })`
- demo response generation when no `OPENAI_API_KEY` is configured
- optional LLM path through `generateWithOpenAI`

- [ ] **Step 4: Run tests**

Run: `npm test`

Expected: PASS for counselor tests.

## Task 5: HTTP Server

**Files:**
- Create: `src/config.js`
- Create: `src/server.js`

- [ ] **Step 1: Implement config**

Load `.env` if present without adding external dependencies.

- [ ] **Step 2: Implement server**

Routes:

- `GET /`: serves `public/index.html`
- `GET /app.js`, `/styles.css`: serves static assets
- `GET /api/status`: returns key/data readiness
- `POST /api/chat`: returns one counseling turn

- [ ] **Step 3: Run smoke check**

Run: `npm test`

Expected: PASS.

## Task 6: Frontend

**Files:**
- Create: `public/index.html`
- Create: `public/styles.css`
- Create: `public/app.js`

- [ ] **Step 1: Build app shell**

Create a single-screen counseling workspace with chat, risk panel, condition panel, actions panel, evidence panel, and mode selector.

- [ ] **Step 2: Wire API calls**

`public/app.js` posts messages to `/api/chat` and renders structured output.

- [ ] **Step 3: Run local app**

Run: `npm start`

Expected: server starts on `http://localhost:5173`.

## Task 7: Verification

**Files:**
- Modify: none unless verification finds defects.

- [ ] **Step 1: Run tests**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 2: Start server**

Run: `npm start`

Expected: server listens on port 5173.

- [ ] **Step 3: API smoke test**

POST a Korean counseling message to `/api/chat`.

Expected: JSON includes `assistantMessage`, `assessment`, `actions`, `session`.

- [ ] **Step 4: Browser smoke check**

Open `http://localhost:5173` and confirm the chat UI renders and returns a response in demo mode.
