# Smoke Test Logfile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `scripts/test-api.ps1` always write full smoke test output to `logs/test-api.log`.

**Architecture:** Add a logfile bootstrap near script startup and route all user-facing output through shared helper functions that mirror content to both the console and the logfile. Keep request execution behavior intact while making logging resilient for large responses and request failures.

**Tech Stack:** PowerShell, existing smoke test script

---

### Task 1: Add logfile bootstrap and shared logging helpers

**Files:**
- Modify: `scripts/test-api.ps1`
- Verify: `logs/test-api.log`

- [ ] **Step 1: Define verification before editing**

Because this repo has no existing PowerShell test harness for `scripts/test-api.ps1`, verify behavior by running the script and inspecting the generated logfile.

- [ ] **Step 2: Add logfile path setup**

Create repo-root-relative paths using `$PSScriptRoot`, ensure `logs/` exists, and initialize `logs/test-api.log` at script startup.

- [ ] **Step 3: Add shared logging helpers**

Implement helper functions that write the same text to the console and logfile so large JSON payloads are preserved.

- [ ] **Step 4: Route smoke test output through helpers**

Update request headings, request metadata, responses, errors, and the final completion line to use the shared logging helpers.

- [ ] **Step 5: Verify generated logfile**

Run: `powershell -ExecutionPolicy Bypass -File scripts/test-api.ps1`

Expected: `logs/test-api.log` exists and contains the full smoke test output, including large response bodies or request failures.
