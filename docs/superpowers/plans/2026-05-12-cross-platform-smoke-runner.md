# Cross-Platform Smoke Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the PowerShell-based smoke test npm entrypoints with Node-based cross-platform scripts.

**Architecture:** Introduce a Node smoke runner that owns request execution and logfile writing, plus a Node tail helper for inspecting `logs/test-api.log`. Keep the smoke runner testable by exporting small helper functions and verify them first with Node’s built-in test runner.

**Tech Stack:** Node.js ESM, built-in `fetch`, built-in `node:test`, filesystem APIs

---

### Task 1: Add failing tests for logfile bootstrap and tail logic

**Files:**
- Create: `scripts/test-api.test.mjs`
- Test: `scripts/test-api.test.mjs`

- [ ] **Step 1: Write the failing test**

Add tests for initializing the logfile and for returning the last N lines from a file. Import functions that do not exist yet from `scripts/test-api.mjs` and `scripts/tail-log.mjs` so the test fails for the right reason.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/test-api.test.mjs`

Expected: FAIL because the new Node modules/functions do not exist yet.

### Task 2: Implement the Node smoke runner and tail helper

**Files:**
- Create: `scripts/test-api.mjs`
- Create: `scripts/tail-log.mjs`
- Modify: `package.json`
- Verify: `logs/test-api.log`

- [ ] **Step 1: Write minimal implementation**

Implement logfile initialization, shared logging, request execution, smoke request definitions, and logfile tail reading using Node built-ins only.

- [ ] **Step 2: Run test to verify it passes**

Run: `node --test scripts/test-api.test.mjs`

Expected: PASS.

- [ ] **Step 3: Wire npm scripts to Node entrypoints**

Change `smoke` to `node scripts/test-api.mjs` and `smoke:tail` to `node scripts/tail-log.mjs`.

- [ ] **Step 4: Run end-to-end verification**

Run: `npm run smoke`

Expected: smoke test completes and writes `logs/test-api.log`.

- [ ] **Step 5: Verify tail command**

Run: `npm run smoke:tail`

Expected: prints the end of `logs/test-api.log` without PowerShell.

### Task 3: Follow-up docs cleanup and obsolete artifact removal

**Files:**
- Modify: `README.md`
- Modify: `DEVELOPMENT.md`
- Verify: repo-wide smoke references

- [ ] **Step 1: Define verification approach**

This follow-up is documentation and cleanup work, so verify with targeted repo searches plus existing smoke/tail command checks instead of a new automated failing test.

- [ ] **Step 2: Add shell-specific environment-variable examples**

Document `BASE_URL` and `DECK_URL` usage for bash/zsh, PowerShell, and cmd in `README.md` and `DEVELOPMENT.md`.

- [ ] **Step 3: Remove obsolete smoke artifacts and references**

Keep the Node smoke runner as the only supported smoke path and remove any stale PowerShell/manual-smoke references that no longer apply.

- [ ] **Step 4: Verify documentation and smoke commands**

Run: `rg -n "test-api\\.ps1|requests\\.http|PowerShell|smoke:tail|npm run smoke|BASE_URL|DECK_URL" . --glob '!node_modules' --glob '!.git'`

Expected: only current Node smoke references remain, and docs include shell-specific examples.

- [ ] **Step 5: Re-run lightweight smoke verification**

Run: `node --test scripts/test-api.test.mjs && npm run smoke:tail -- 5`

Expected: tests pass and logfile tail still works.
