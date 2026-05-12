import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(SCRIPT_PATH);
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');

const DEFAULT_BASE_URL = 'http://localhost:3001';
const DEFAULT_DECK_URL = 'https://moxfield.com/decks/4G6ciTnZ0Ua2tXeDy6nsDw';
export const DEFAULT_LOG_PATH = path.join(REPO_ROOT, 'logs', 'test-api.log');

// CLI entrypoint configuration comes from environment variables so the same
// script works from npm on Windows, macOS, and Linux without shell-specific
// wrappers. See README.md for usage examples.

function formatTimestamp(date) {
  const pad = (value) => String(value).padStart(2, '0');

  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate())
  ].join('-') + ' ' + [
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds())
  ].join(':');
}

function formatJson(value) {
  return JSON.stringify(value, null, 2);
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function initializeLogFile(logPath = DEFAULT_LOG_PATH, startedAt = new Date()) {
  await mkdir(path.dirname(logPath), { recursive: true });
  await writeFile(
    logPath,
    `Lorevault API smoke test log\nStarted: ${formatTimestamp(startedAt)}\n\n`,
    'utf8'
  );

  return logPath;
}

export function createLogger(logPath = DEFAULT_LOG_PATH) {
  return {
    log: async (message = '') => {
      console.log(message);
      await appendFile(logPath, `${message}\n`, 'utf8');
    }
  };
}

export function buildSmokeRequests(deckUrl = DEFAULT_DECK_URL) {
  return [
    {
      name: 'Health check',
      method: 'GET',
      path: '/api/health'
    },
    {
      name: 'Collection filter: blue + black + colorless',
      method: 'POST',
      path: '/api/collection',
      body: {
        colors: ['U', 'B'],
        colorless: true
      }
    },
    {
      name: 'Deck parse: manual decklist',
      method: 'POST',
      path: '/api/deck/parse',
      body: {
        source: 'manual',
        payload: "// Commander\n1 Atraxa, Praetors' Voice\n// Mainboard\n1 Sol Ring\n1 Arcane Signet\n1 Beast Within\n1 Swords to Plowshares\n"
      }
    },
    {
      name: 'Deck parse: Moxfield deck URL',
      method: 'POST',
      path: '/api/deck/parse',
      body: {
        source: 'moxfield',
        payload: deckUrl
      }
    },
    {
      name: 'Deck resolve: manual ParsedDeck payload',
      method: 'POST',
      path: '/api/deck/resolve',
      body: {
        source: 'manual',
        commander: ["Atraxa, Praetors' Voice"],
        mainboard: [
          { name: 'Sol Ring', qty: 1 },
          { name: 'Arcane Signet', qty: 1 },
          { name: 'Mana Crypt', qty: 1 },
          { name: 'Beast Within', qty: 1 }
        ],
        unresolved: []
      }
    },
    {
      name: 'Deck resolve: payload with unresolved parser leftovers',
      method: 'POST',
      path: '/api/deck/resolve',
      body: {
        source: 'manual',
        commander: ['Kadena, Slinking Sorcerer'],
        mainboard: [
          { name: 'Sol Ring', qty: 1 },
          { name: 'Arcane Signet', qty: 1 },
          { name: 'Seedborn Muse', qty: 1 }
        ],
        unresolved: ['garbage line from parser']
      }
    }
  ];
}

export async function invokeLorevaultRequest({ logger, baseUrl, name, method, path: requestPath, body }) {
  const url = new URL(requestPath, baseUrl).toString();

  await logger.log(`\n=== ${name} ===`);
  await logger.log(`${method} ${url}`);

  const init = {
    method,
    headers: {
      'Content-Type': 'application/json'
    }
  };

  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, init);
    const text = await response.text();
    const parsed = text ? tryParseJson(text) : null;
    const renderedBody = parsed !== null ? formatJson(parsed) : text;

    if (!response.ok) {
      await logger.log(`Request failed with status ${response.status}`);
      if (renderedBody) {
        await logger.log(renderedBody);
      }
      return;
    }

    await logger.log(renderedBody || '{}');
  } catch (error) {
    await logger.log('Request failed.');
    await logger.log(error instanceof Error ? error.message : String(error));
  }
}

export async function runSmokeTest({
  baseUrl = process.env.BASE_URL ?? DEFAULT_BASE_URL,
  deckUrl = process.env.DECK_URL ?? DEFAULT_DECK_URL,
  logPath = DEFAULT_LOG_PATH,
  startedAt = new Date()
} = {}) {
  await initializeLogFile(logPath, startedAt);

  const logger = createLogger(logPath);
  const requests = buildSmokeRequests(deckUrl);

  for (const request of requests) {
    await invokeLorevaultRequest({ logger, baseUrl, ...request });
  }

  await logger.log('\nLorevault API smoke test complete.');
  await logger.log(`Full output saved to ${logPath}`);

  return logPath;
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  runSmokeTest().catch(async (error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
