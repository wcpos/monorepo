import { fillWithDefaultSettings, normalizeMangoQuery, prepareQuery } from 'rxdb/plugins/core';
import { createHash, randomUUID } from 'node:crypto';
import { readdir, stat, writeFile } from 'node:fs/promises';
import { join, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { openEngine, rows, directory, environment } from './engines.mjs';
// Schemas and fixtures copied verbatim from 2143; do not tune them for either engine.
const string = maxLength => ({ type: 'string', maxLength }), object = { type: 'object', additionalProperties: true };
const number = { type: 'number', minimum: 0, maximum: 100000000, multipleOf: 1 };
const productFields = {
  uuid: string(128), remoteId: string(64), price: { ...number, minimum: -100000000, multipleOf: 0.01 },
  stockStatus: string(24), type: string(24), categoryIds: { type: 'array', items: number }, brandIds: { type: 'array', items: number },
  onSale: { type: 'boolean' }, featured: { type: 'boolean' }, stockQuantity: { type: ['number', 'null'] },
  payload: { ...object, properties: { status: string(16), name: string(200) }, required: ['status', 'name'] }, sync: object, local: object,
};
const orderFields = { uuid: string(128), remoteId: number, number: string(64), dateCreatedGmt: string(32), status: string(32), total: { type: 'number' }, customerId: number, payload: object, sync: object, local: object };
export const schemas = Object.fromEntries([
  ['products', productFields, ['stockStatus', 'price', ['type', 'stockStatus'], 'remoteId', 'payload.status', ['payload.status', 'stockStatus'], 'payload.name']],
  ['orders', orderFields, [['dateCreatedGmt'], ['status', 'dateCreatedGmt'], 'remoteId']],
  ['mutations', { id: string(64), collection: string(32), operation: string(32), createdAt: number, payload: object }, []],
].map(([name, properties, indexes]) => [name, fillWithDefaultSettings({ version: 0, primaryKey: name === 'mutations' ? 'id' : 'uuid', type: 'object', properties, required: Object.keys(properties), indexes })]));
const stamp = i => ({ _deleted: false, _attachments: {}, _rev: '1-seed', _meta: { lwt: 1700000000000 + i } });
const uuid = i => String(i).padStart(8, '0');
const rng = seed => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const words = ['amber', 'birch', 'cedar', 'delta', 'elm', 'fern', 'grove', 'quartz', 'cobalt', 'maple'];
function line(i) {
  const row = { id: i, name: `Item ${i}`, product_id: i, quantity: 1, price: 10, subtotal: '10', total: '10', sku: `SKU-${i}`, tax_class: '', taxes: [],
    meta_data: [{ key: '_woocommerce_pos_uuid', value: uuid(i) }, { key: '_woocommerce_pos_data', value: { source: 'pos', padding: '' } }] };
  row.meta_data[1].value.padding = 'x'.repeat(Math.max(0, 400 - JSON.stringify(row).length));
  return row;
}
export function fixtures(n) {
  const random = rng(2143), products = [], orders = [];
  for (let i = 1; i <= n; i++) {
    const name = `${words[Math.floor(random() * words.length)]} ${words[Math.floor(random() * words.length)]} ${i}`;
    const status = random() < .9 ? 'publish' : 'draft', stockStatus = random() < .85 ? 'instock' : 'outofstock', type = random() < .8 ? 'simple' : 'variable';
    const payload = { id: i, name, slug: `fixture-${i}`, sku: `SKU-${i}`, global_unique_id: `501234${i}`, description: '', short_description: '', type, status,
      parent_id: 0, stock_status: stockStatus, manage_stock: false, stock_quantity: null, price: '10', regular_price: '10', sale_price: '', on_sale: false, featured: false,
      date_created_gmt: '2026-09-01T00:00:00', date_modified_gmt: '2026-09-01T00:00:00', permalink: `https://example.invalid/product/${i}`,
      images: [{ id: i, src: `https://example.invalid/${i}.jpg` }], categories: [{ id: 1, name: 'Items', slug: 'items' }], tags: [], brands: [], attributes: [], variations: [],
      meta_data: [{ id: 5000000 + i, key: '_woocommerce_pos_uuid', value: uuid(i) }] };
    const product = { uuid: uuid(i), remoteId: String(i), price: 10, stockStatus, type, categoryIds: [1], brandIds: [], onSale: false, featured: false, stockQuantity: null, payload, sync: {}, local: {}, ...stamp(i) };
    payload.description = 'x'.repeat(Math.max(0, 2000 - JSON.stringify(product).length));
    products.push(product);
    const prose = Array.from({ length: 10 }, (_, j) => words[(Math.imul(i + 1, 1664525 + j * 2) >>> 0) % 7]).join(' ');
    const order = { uuid: uuid(i), remoteId: i, number: String(i), dateCreatedGmt: new Date(1700000000000 + i * 1000).toISOString(),
      status: ['pos-open', 'pos-partial', 'pending', 'completed', 'cancelled'][Math.floor(i / 4) % 5], total: 10, customerId: i % 100, sync: {}, local: {}, ...stamp(i),
      payload: { meta_data: [{ id: 1, key: '_pos_user', value: String(i % 4 + 1) }, { id: 2, key: '_pos_store', value: String(Math.floor(i / 4) % 2 + 1) },
        ...Array.from({ length: 4 + i % 5 }, (_, j) => ({ id: j + 3, key: `extra_${j}`, value: prose }))], line_items: [] } };
    order.payload.line_items = Array.from({ length: 1 + Math.floor(random() * 8) }, (_, j) => line(i * 10 + j));
    orders.push(order);
  }
  return { products, orders };
}
// Full document comparisons, ignoring only revisions and object-key ordering. ID reads have no order contract.
const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).filter(k => k !== '_rev').sort().map(k => [k, canonical(v[k])])) : v;
async function signature(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}
const sorted = docs => [...docs].sort((a, b) => (a.uuid ?? a.id).localeCompare(b.uuid ?? b.id));
let session;
async function open(engine, dir, databaseName, collections) {
  session = await openEngine(engine, dir, databaseName);
  const instances = {};
  for (const name of collections) instances[name] = await create(name);
  return instances;
}
const create = (collection, suffix = '') => session.create(collection, schemas[collection], suffix);
async function diskBytes(dir) {
  let bytes = 0, files = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) { const sub = await diskBytes(path); bytes += sub.bytes; files += sub.files; }
    else { bytes += (await stat(path)).size; files++; }
  }
  return { bytes, files };
}
async function write(instance, rows) {
  const result = await instance.bulkWrite(rows, 'spike2143');
  if (result.error.length) throw new Error(JSON.stringify(result.error));
  return result;
}
async function seed(instance, documents) { for (let i = 0; i < documents.length; i += 1000) await write(instance, documents.slice(i, i + 1000).map(document => ({ document }))); }
const prepared = (collection, selector = {}, extra = {}, count = false) => prepareQuery(schemas[collection], normalizeMangoQuery(schemas[collection], { selector: { ...selector, _deleted: false }, ...extra }, count));
async function runBench({ engine, scale, databaseName, dir }) {
  const n = scale === 'small' ? 2000 : 20000, data = fixtures(n), cells = [];
  const instances = await open(engine, dir, databaseName, ['products', 'orders', 'mutations']);
  session.proveWal();
  for (const name of ['products', 'orders']) await seed(instances[name], data[name]);
  // Same post-resync planner statistics as 2143, outside timed cells.
  await session.analyze(instances.products);
  const disk = scale === 'large' ? await diskBytes(dir) : undefined;
  const seedBytes = Object.fromEntries(Object.entries(data).map(([k, docs]) => [k, docs.reduce((a, d) => a + JSON.stringify(d).length, 0) / n]));
  // Is `docs` in the order RxDB's normalized `sort` promises? (No-sort queries normalize to an
  // index-led sort such as [_deleted, stockStatus, uuid], not to the primary key alone.)
  const get = (doc, path) => path.split('.').reduce((v, k) => v?.[k], doc);
  const inSortOrder = (docs, sort) => docs.every((d, j) => j === 0 || sort.reduce((cmp, s) => {
    if (cmp !== 0) return cmp;
    const [field, dir] = Object.entries(s)[0], a = get(docs[j - 1], field), b = get(d, field);
    return (a < b ? -1 : a > b ? 1 : 0) * (dir === 'desc' ? -1 : 1);
  }, 0) <= 0);
  async function sample(name, count, setup, sort = null) {
    // `signatures` hash the result AS RETURNED (order included, 2143's rule); `setSignatures` hash
    // the same rows sorted by primary key. Content must match across engines on the set; a
    // returned-order difference between engines is recorded on the cell as `orderMismatch`, and
    // `unsortedSamples` counts results that violate the query's own normalized sort (the incumbent
    // returns whole-set finds in an unstable order in Node — seen on Mac and Windows, 2026-09-23).
    const cell = { name, samples: [], signatures: [], setSignatures: [], unsortedSamples: 0 };
    for (let i = 0; i <= count; i++) {
      const { run, check = r => r.documents ?? r.count ?? r } = await setup(i), start = performance.now();
      const result = await run(), ms = performance.now() - start, value = await check(result);
      cell.signatures.push(await signature(value));
      cell.setSignatures.push(await signature(Array.isArray(value) && value[0] && typeof value[0] === 'object' ? sorted(value) : value));
      if (sort && Array.isArray(value) && !inSortOrder(value, sort)) cell.unsortedSamples++;
      if (i) cell.samples.push({ ms, ...(Array.isArray(result?.documents ?? result) ? { rows: (result.documents ?? result).length } : {}) });
      // Keep the returned ids of small (limited) results so a cross-engine mismatch can be judged offline.
      if (Array.isArray(value) && value.length <= 100 && value[0] && typeof value[0] === 'object') (cell.ids ??= []).push(value.map(d => d.uuid ?? d.id));
    }
    cells.push(cell);
    console.info('CELL', engine, scale, name, cell.unsortedSamples ? `UNSORTED ${cell.unsortedSamples}/${count + 1}` : '');
  }
  const find = (name, collection, selector, extra) => { const q = prepared(collection, selector, extra); return sample(name, 7, () => ({ run: () => instances[collection].query(q) }), q.query.sort); };
  const grid = { $and: [{ 'payload.status': 'publish' }, { stockStatus: 'instock' }] };
  await find('products-grid-asShipped', 'products', grid);
  for (const limit of [10, 50]) await find(`products-grid-pushed-${limit}`, 'products', grid, { sort: [{ 'payload.name': 'asc' }, { uuid: 'asc' }], limit });
  await find('products-catalogue-blob', 'products', {});
  const projectionQuery = prepared('products');
  await sample('products-catalogue-projection', 7, () => ({ run: () => session.projection(instances.products, projectionQuery), check: sorted }));
  const random = rng(2144), ids = [];
  while (ids.length < 100) { const id = uuid(1 + Math.floor(random() * n)); if (!ids.includes(id)) ids.push(id); }
  for (const limit of [10, 50]) await sample(`products-findByIds-${limit}`, 7, () => ({ run: () => instances.products.findDocumentsById(ids.slice(0, limit), false), check: sorted }));
  const remote = { remoteId: { $in: ids.map(id => String(Number(id))) } };
  await find('products-remoteId-in-find', 'products', remote, { sort: [{ uuid: 'asc' }] });
  await sample('products-remoteId-in-count', 7, () => { const q = prepared('products', remote, {}, true); return { run: () => instances.products.count(q) }; });
  await sample('seed-products', 3, async i => {
    const instance = await create('products', `-seed-${i}`);
    return { run: () => seed(instance, data.products), check: async () => {
      const docs = (await instance.query(prepared('products', {}, { sort: [{ uuid: 'asc' }] }))).documents;
      if (await signature(docs) !== await signature(data.products)) throw new Error('Seed content mismatch');
      await instance.remove(); return docs;
    } };
  });
  const scope = { $and: [{ 'payload.meta_data': { $elemMatch: { key: '_pos_user', value: '1' } } }, { 'payload.meta_data': { $elemMatch: { key: '_pos_store', value: '1' } } }] };
  for (const limit of [10, 50]) await find(`orders-default-find-${limit}`, 'orders', scope, { sort: [{ dateCreatedGmt: 'desc' }], limit });
  await sample('orders-default-count', 7, () => { const q = prepared('orders', scope, {}, true); return { run: () => instances.orders.count(q) }; });
  await find('orders-open-status', 'orders', { status: { $in: ['pos-open', 'pos-partial', 'pending'] } });
  const fiveLines = data.orders.filter(d => d.payload.line_items.length === 5);
  for (const kind of ['order-line-add', 'order-create']) await sample(kind, 25, async i => {
    const adding = kind === 'order-line-add', source = adding ? fiveLines.splice(Math.floor(random() * fiveLines.length), 1)[0] : data.orders[0];
    const previous = adding ? (await instances.orders.findDocumentsById([source.uuid], false))[0] : undefined;
    const document = structuredClone(previous ?? source);
    if (!adding) Object.assign(document, { uuid: `new-${uuid(i)}`, remoteId: n + i + 1, number: `new-${i}`, ...stamp(n + i) });
    document.payload.line_items = adding ? [...document.payload.line_items, line(n + i)] : [line(n + i)];
    document.payload.date_modified_gmt = new Date(1800000000000 + i * 1000).toISOString();
    document._rev = adding ? '2-line' : '1-created'; document._meta.lwt += 100000;
    const dirty = { ...document, local: { ...document.local, dirty: true }, _rev: '3-dirty', _meta: { lwt: document._meta.lwt + 1 } };
    const mutation = { id: `${kind}-${i}`, collection: 'orders', operation: adding ? 'update' : 'create', createdAt: i, payload: { uuid: document.uuid }, ...stamp(n + i) };
    return { run: async () => {
      await write(instances.orders, [{ ...(previous ? { previous } : {}), document }]);
      await write(instances.mutations, [{ document: mutation }]);
      if (adding) await write(instances.orders, [{ previous: document, document: dirty }]);
    }, check: async () => {
      const docs = [...await instances.orders.findDocumentsById([document.uuid], false), ...await instances.mutations.findDocumentsById([mutation.id], false)];
      if (await signature(docs) !== await signature([adding ? dirty : document, mutation])) throw new Error(`${kind} content mismatch`);
      return docs;
    } };
  });
  return { cells, seedBytes, disk, wal: session.wal };
};

async function coldRead(args) {
  const start = performance.now(), instances = await open(args.row, args.dir, args.db, ['products']);
  const docs = await instances.products.findDocumentsById([uuid(1)], false), ms = performance.now() - start;
  session.proveWal(); // Verification is outside the cold-open timer.
  assert.equal(await signature(docs), await signature(fixtures(1).products), 'Cold read content mismatch');
  await session.close();
  // stdout is only the number; WAL proof goes to stderr.
  console.log(ms);
}
async function coldProcess(input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--cold-open', '--row', input.engine, '--dir', input.dir, '--db', input.databaseName], { stdio: ['ignore', 'pipe', 'inherit'] });
    let output = ''; child.stdout.on('data', b => { output += b; });
    child.on('error', reject);
    child.on('close', code => code === 0 && Number.isFinite(Number(output.trim())) && output.trim()
      ? resolve(Number(output.trim())) : reject(new Error(`Cold child exited ${code}: ${output}`)));
  });
}
async function main() {
  const { values: args } = parseArgs({ options: { scale: { type: 'string', default: 'both' }, out: { type: 'string' }, rows: { type: 'string', default: rows.join(',') },
    'cold-open': { type: 'boolean' }, row: { type: 'string' }, dir: { type: 'string' }, db: { type: 'string' } } });
  if (args['cold-open']) return coldRead(args);
  assert(['small', 'large', 'both'].includes(args.scale), 'Invalid scale');
  assert(args.rows.split(',').every(r => rows.includes(r)), 'Invalid rows');
  const selected = rows.filter(r => args.rows.split(',').includes(r));
  const env = await environment(), expected = new Map(), results = [], mismatches = [];
  for (const engine of selected) for (const scale of args.scale === 'both' ? ['small', 'large'] : [args.scale]) {
    const databaseName = `bench-${randomUUID()}`, dir = join(directory, '.data', 'bench', engine, databaseName);
    const input = { engine, scale, databaseName, dir };
    let result;
    try { result = await runBench(input); } finally { if (session) await session.close(); }
    if (scale === 'large') {
      const cell = { name: 'cold-open-first-read', samples: [] };
      for (let i = 0; i < 4; i++) { const ms = await coldProcess(input); if (i) cell.samples.push({ ms, rows: 1 }); }
      result.cells.push(cell);
    }
    for (const cell of result.cells) {
      const key = `${scale}/${cell.name}`;
      if (cell.signatures) {
        if (expected.has(key)) {
          const prior = expected.get(key);
          // A content mismatch fails the run (exit 1 after the JSON is written) but does not abort it:
          // the cell keeps both engines' returned ids so the deviating engine can be identified.
          cell.contentMismatch = cell.setSignatures.some((s, i) => s !== prior.setSignatures[i]);
          if (cell.contentMismatch) { mismatches.push(key); cell.priorIds = prior.ids; console.error('CROSS-ENGINE CONTENT MISMATCH', engine, key); }
          cell.orderMismatch = !cell.contentMismatch && cell.signatures.some((s, i) => s !== prior.signatures[i]);
          if (!cell.contentMismatch) console.info(cell.orderMismatch ? 'EQUALITY PASS (content only; returned order differs)' : 'EQUALITY PASS', key);
        } else expected.set(key, { signatures: cell.signatures, setSignatures: cell.setSignatures, ids: cell.ids });
        delete cell.signatures; delete cell.setSignatures;
      }
      const samples = cell.samples.map(s => s.ms).sort((a, b) => a - b);
      Object.assign(cell, { p50: samples[Math.ceil(samples.length * .5) - 1], p95: samples[Math.ceil(samples.length * .95) - 1], max: samples.at(-1) });
    }
    results.push({ engine, scale, ...result });
  }
  const out = args.out ?? join(directory, `results.${env.platform}.json`);
  await writeFile(out, JSON.stringify({ environment: env, equality: selected.length !== 2 ? 'Single engine only: cross-engine equality NOT evaluated.'
    : mismatches.length ? `CONTENT MISMATCH in ${mismatches.join(', ')} — the numbers for those cells are not comparable; see the cells' ids/priorIds.`
    : 'All warmups and samples matched across both engines on content (SHA-256 of canonical revision-independent rows sorted by primary key); cells whose RETURNED order differed between engines carry orderMismatch, and each engine\'s unsortedSamples counts results that violate the query\'s normalized sort. Cold reads assert the exact seeded product.',
    results }, null, 2) + '\n');
  console.info('Wrote', out);
  if (mismatches.length) { console.error(`Cross-engine content mismatch: ${mismatches.join(', ')}`); process.exitCode = 1; }
}
// The crash child imports fixtures; bundled imports share import.meta.url with that entry point.
if (/^bench-node\.(mjs|js)$/.test(basename(fileURLToPath(import.meta.url))) && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
