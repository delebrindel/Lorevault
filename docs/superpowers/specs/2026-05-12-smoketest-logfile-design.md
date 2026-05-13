# Smoke Test Logfile Design

## Summary
Add built-in logfile support to `scripts/test-api.ps1` so every smoke test run always writes complete output to `logs/test-api.log` while preserving readable console output.

## Goals
- Always create/update a logfile on each run.
- Keep the current smoke test requests and console readability.
- Capture large JSON responses and error output in a single inspectable file.

## Approach
- Compute the repo-root-relative logfile path from the script location.
- Ensure the `logs/` directory exists.
- Initialize `logs/test-api.log` at script startup.
- Replace direct `Write-Host` usage in the request flow with small helper functions that write to both console and logfile.
- Log request headings, request metadata, formatted JSON responses, and failure details.

## Error Handling
- Preserve existing request exception handling.
- Make status-code logging resilient when the exception has no HTTP response object.

## Verification
- Run the smoke test script.
- Confirm `logs/test-api.log` is created.
- Confirm the file includes section headers and response/error bodies for each request.
