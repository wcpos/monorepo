import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const directory = fileURLToPath(new URL('.build/', import.meta.url)), bundles = {};
for (const name of ['bench.js', 'opfs.worker.js', 'worker-sqlite.js', 'worker-indexeddb.js', 'sqlite3.wasm'])
  bundles[name] = await readFile(resolve(directory, name));
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const context = await browser.newContext(), page = await context.newPage();
  const pageError = new Promise((_, reject) => page.on('pageerror', reject));
  // Context routing also serves worker-initiated wasm fetches, exactly as in bench.mjs.
  await context.route('http://localhost:18999/**', route => {
    const name = basename(new URL(route.request().url()).pathname), body = bundles[name];
    return route.fulfill({ status: body || name === '' ? 200 : 404, headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' },
      contentType: name.endsWith('.wasm') ? 'application/wasm' : body ? 'text/javascript' : 'text/html', body: body ?? '<!doctype html><script type="module" src="/bench.js"></script>' });
  });
  const result = await Promise.race([pageError, (async () => {
    await page.goto('http://localhost:18999/');
    await page.waitForFunction(() => typeof globalThis.probeFindByIds === 'function');
    const result = await page.evaluate(input => globalThis.probeFindByIds(input), { databaseName: `spike2143-probe-${Date.now()}` });
    await page.evaluate(() => globalThis.closeBench());
    return result;
  })()]);
  console.info(JSON.stringify(result, null, 2));
} finally { await browser.close(); }
