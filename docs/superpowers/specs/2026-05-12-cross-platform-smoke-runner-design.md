# Cross-Platform Smoke Runner Design

## Summary
Replace the PowerShell-only smoke test entrypoint with a Node-based implementation so `npm run smoke` and `npm run smoke:tail` work across Windows, macOS, and Linux without requiring PowerShell, Git Bash, or Cmder.

## Goals
- Make smoke test execution shell-agnostic.
- Preserve the current sequence of API requests.
- Preserve built-in logfile output to `logs/test-api.log`.
- Preserve a simple way to inspect the end of the logfile.

## Approach
- Add `scripts/test-api.mjs` as the new smoke runner.
- Add a small testable module surface by exporting helpers from the Node script.
- Use Node built-ins only: `fetch`, `fs/promises`, `path`, `url`.
- Remove the obsolete PowerShell smoke script once the Node path is verified.
- Add `scripts/tail-log.mjs` for shell-independent logfile tailing.
- Document shell-specific environment-variable examples for bash/zsh, PowerShell, and cmd.

## Logging
- Resolve the repo root from the script path.
- Ensure `logs/` exists.
- Always recreate `logs/test-api.log` at startup.
- Mirror section headings, request metadata, JSON responses, and errors to both console and logfile.

## Error Handling
- Continue running requests after individual failures.
- Log HTTP status and body text for non-2xx responses when available.
- Fall back to the thrown error message if no response body exists.

## Verification
- Add a failing automated test first for logfile initialization and tail behavior.
- Run the new test with Node’s built-in test runner.
- Run `npm run smoke` against the live API.
- Run `npm run smoke:tail` and confirm it reads the generated logfile.
