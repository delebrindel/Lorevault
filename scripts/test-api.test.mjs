import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';

import { initializeLogFile } from './test-api.mjs';
import { readTailLines } from './tail-log.mjs';

test('initializeLogFile creates the log file with a smoke test header', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'lorevault-smoke-'));
  const logPath = path.join(tempRoot, 'logs', 'test-api.log');

  await initializeLogFile(logPath, new Date('2026-05-12T12:34:56Z'));

  const contents = await readFile(logPath, 'utf8');

  assert.match(contents, /^Lorevault API smoke test log/m);
  assert.match(contents, /Started: 2026-05-12 12:34:56/m);
});

test('readTailLines returns the last requested lines in order', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'lorevault-tail-'));
  const logPath = path.join(tempRoot, 'test-api.log');

  await writeFile(logPath, ['one', 'two', 'three', 'four'].join('\n'), 'utf8');

  const lines = await readTailLines(logPath, 2);

  assert.deepEqual(lines, ['three', 'four']);
});
