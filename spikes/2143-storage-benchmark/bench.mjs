import { readFile, writeFile } from 'node:fs/promises';
import { arch, cpus, platform, release } from 'node:os';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import assert from 'node:assert/strict';
import { chromium, firefox, webkit } from 'playwright';
const directory = fileURLToPath(new URL('.', import.meta.url));
const { values: args } = parseArgs({ options: { browser: { type: 'string', default: 'chrome' }, bundles: { type: 'string', default: resolve(directory, '.build') }, out: { type: 'string' }, scale: { type: 'string', default: 'both' } } });
assert(['chrome', 'firefox', 'webkit'].includes(args.browser) && ['small', 'large', 'both'].includes(args.scale), 'Invalid browser or scale');
const versions = JSON.parse(await readFile(resolve(args.bundles, 'versions.json'))), bundles = {};
for (const name of ['bench.js', 'opfs.worker.js', 'worker-sqlite.js', 'worker-indexeddb.js', 'sqlite3.wasm']) bundles[name] = await readFile(resolve(args.bundles, name));
const engineNames = ['opfs-shipped', 'sqlite-sahpool', 'indexeddb-premium'], expected = new Map(), results = [];
const browser = await ({ chrome: chromium, firefox, webkit }[args.browser]).launch(args.browser === 'chrome' ? { channel: 'chrome' } : {});
const environment = { browser: args.browser, browserVersion: browser.version(), os: `${platform()} ${release()} ${arch()}`, cpu: cpus()[0].model, node: process.version, versions, measuredAt: new Date().toISOString() };
function verify(scale, engine, cell) {
  const key = `${scale}/${cell.name}`;
  if (expected.has(key)) assert.deepEqual(cell.signatures, expected.get(key), `Cross-engine mismatch: ${engine}/${key}`);
  else expected.set(key, cell.signatures);
  delete cell.signatures;
  const sorted = cell.samples.map(s => s.ms).sort((a, b) => a - b);
  Object.assign(cell, { p50: sorted[Math.ceil(sorted.length * .5) - 1], p95: sorted[Math.ceil(sorted.length * .95) - 1], max: sorted.at(-1) });
}
async function measure() {
  for (const scale of args.scale === 'both' ? ['small', 'large'] : [args.scale]) for (const engine of engineNames) {
    const context = await browser.newContext(), page = await context.newPage(), errors = [];
    let fetched = [];
    page.on('console', m => console.info('[page]', m.text()));
    page.on('pageerror', e => errors.push(String(e)));
    // Context routing also serves worker-initiated wasm fetches; a page route alone misses those.
    await context.route('http://localhost:18999/**', route => {
      const name = basename(new URL(route.request().url()).pathname), body = bundles[name];
      if (body) fetched.push({ file: name, bytes: body.length });
      return route.fulfill({ status: body || name === '' ? 200 : 404, headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' },
        contentType: name.endsWith('.wasm') ? 'application/wasm' : body ? 'text/javascript' : 'text/html', body: body ?? '<!doctype html><script type="module" src="/bench.js"></script>' });
    });
    const load = async reload => { await (reload ? page.reload() : page.goto('http://localhost:18999/')); await page.waitForFunction(() => typeof globalThis.runBench === 'function'); };
    const databaseName = `spike2143-${engine}-${scale}-${Date.now()}`, input = { engine, scale, databaseName };
    try {
      await load(false);
      const result = await page.evaluate(input => globalThis.runBench(input), input);
      await page.evaluate(() => globalThis.closeBench());
      if (scale === 'large') {
        const cell = { name: 'cold-open-first-read', samples: [], signatures: [] };
        for (let i = 0; i < 4; i++) {
          await load(true); fetched = [];
          const { signature, ...sample } = await page.evaluate(input => globalThis.coldRead(input), input);
          cell.signatures.push(signature);
          if (i) cell.samples.push({ ...sample, fetched: [...fetched] });
          await page.evaluate(() => globalThis.closeBench());
        }
        result.cells.push(cell);
      }
      assert.equal(errors.length, 0, errors.join('\n'));
      for (const cell of result.cells) verify(scale, engine, cell);
      results.push({ scale, engine, ...result });
    } finally { await context.close(); }
  }
}
let timer;
try {
  await Promise.race([measure(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Benchmark exceeded 110 minutes')), 110 * 60 * 1000); })]);
  const out = args.out ?? resolve(directory, `results.${args.browser}.json`);
  await writeFile(out, JSON.stringify({ environment, bundleBytes: Object.fromEntries(Object.entries(bundles).map(([n, b]) => [n, b.length])), equality: 'All warmups and samples matched across all three engines (SHA-256 of canonical revision-independent content).', results }, null, 2) + '\n');
  console.info('Wrote', out);
} finally { clearTimeout(timer); await browser.close(); }
