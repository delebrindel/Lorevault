import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_LOG_PATH } from './test-api.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);

export async function readTailLines(filePath = DEFAULT_LOG_PATH, lineCount = 80) {
  const contents = await readFile(filePath, 'utf8');
  const normalized = contents.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');

  if (lines.at(-1) === '') {
    lines.pop();
  }

  return lines.slice(-lineCount);
}

export async function tailLog({ filePath = DEFAULT_LOG_PATH, lineCount = 80 } = {}) {
  const lines = await readTailLines(filePath, lineCount);

  for (const line of lines) {
    console.log(line);
  }

  return lines;
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  // Supports: `npm run smoke:tail` and `npm run smoke:tail -- 200`
  const argCount = Number.parseInt(process.argv[2] ?? '', 10);
  const lineCount = Number.isFinite(argCount) ? argCount : 80;

  tailLog({ lineCount }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
