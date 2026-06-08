# Rogerian Cumulative Assessment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the app from a one-turn classifier into a person-centered conversation system with cumulative AIHub-style state tracking.

**Architecture:** Add a `sessionState` module that summarizes all user messages into phase, signals, AIHub label scores, and hypotheses. Update `counselor` so visible replies follow Rogers-style reflection first and expose cumulative state in `assessment.sessionProfile`.

**Tech Stack:** Node.js ESM, built-in `node:test`, existing vanilla HTTP server and frontend.

---

### Task 1: Cumulative State Profile

**Files:**
- Create: `src/sessionState.js`
- Create: `test/sessionState.test.js`

- [ ] Write failing tests for opening/exploring/integrating phases.
- [ ] Implement `buildSessionProfile(messages)`.
- [ ] Verify AIHub label scores use 0-3 scale.

### Task 2: Rogers-First Conversation

**Files:**
- Modify: `src/counselor.js`
- Modify: `test/counselor.test.js`

- [ ] Write failing tests that first replies avoid labels and ask experience-near questions.
- [ ] Write failing tests that later replies can summarize tentative hypotheses.
- [ ] Implement Rogers-style response composition using `sessionProfile`.

### Task 3: Preserve Safety and Repair

**Files:**
- Modify: `src/counselor.js`
- Modify: `test/counselor.test.js`

- [ ] Verify direct self-harm and method questions still trigger safety.
- [ ] Verify bereavement and rupture repair do not get swallowed by safety follow-up.

### Task 4: Full Verification

**Files:**
- Existing test suite

- [ ] Run `node --test`.
- [ ] Run `node --check src/sessionState.js src/counselor.js`.
- [ ] Restart local server and verify `/api/chat` for opening, multi-turn, and urgent cases.

