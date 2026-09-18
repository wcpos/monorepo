import { getRxStorageWorker } from 'rxdb-premium/plugins/storage-worker';
import { fillWithDefaultSettings, normalizeMangoQuery, prepareQuery, randomToken } from 'rxdb/plugins/core';
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
  const bytes = new TextEncoder().encode(JSON.stringify(canonical(value)));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
}
const sorted = docs => [...docs].sort((a, b) => (a.uuid ?? a.id).localeCompare(b.uuid ?? b.id));
let session;
async function open(engine, databaseName, collections) {
  const workerOptions = { name: 'spike-2143-opfs', ...(engine === 'opfs-shipped' ? {} : { type: 'module' }) };
  const file = { 'opfs-shipped': 'opfs.worker.js', 'sqlite-sahpool': 'worker-sqlite.js', 'indexeddb-premium': 'worker-indexeddb.js' }[engine];
  const worker = new Worker('/' + file, workerOptions);
  const storage = getRxStorageWorker({ workerInput: () => worker, workerOptions, mode: 'storage' });
  session = { worker, storage, instances: {}, databaseName };
  for (const collection of collections) session.instances[collection] = await create(collection, databaseName);
  return session.instances;
}
const create = (collectionName, databaseName) => session.storage.createStorageInstance({ databaseName, collectionName, schema: schemas[collectionName], databaseInstanceToken: randomToken(10), options: {}, multiInstance: false, devMode: true });
globalThis.closeBench = async () => { try { for (const instance of Object.values(session.instances)) await instance.close(); } finally { session.worker.terminate(); } };
async function write(instance, rows) {
  const result = await instance.bulkWrite(rows, 'spike2143');
  if (result.error.length) throw new Error(JSON.stringify(result.error));
  return result;
}
async function seed(instance, documents) { for (let i = 0; i < documents.length; i += 1000) await write(instance, documents.slice(i, i + 1000).map(document => ({ document }))); }
const prepared = (collection, selector = {}, extra = {}, count = false) => prepareQuery(schemas[collection], normalizeMangoQuery(schemas[collection], { selector: { ...selector, _deleted: false }, ...extra }, count));
globalThis.runBench = async ({ engine, scale, databaseName }) => {
  const n = scale === 'small' ? 2000 : 20000, data = fixtures(n), cells = [];
  const instances = await open(engine, databaseName, ['products', 'orders', 'mutations']);
  for (const name of ['products', 'orders']) await seed(instances[name], data[name]);
  const storageUsage = scale === 'large' ? (await navigator.storage.estimate()).usage : undefined;
  const seedBytes = Object.fromEntries(Object.entries(data).map(([k, docs]) => [k, docs.reduce((a, d) => a + JSON.stringify(d).length, 0) / n]));
  async function sample(name, count, setup) {
    const cell = { name, samples: [], signatures: [] };
    for (let i = 0; i <= count; i++) {
      const { run, check = r => r.documents ?? r.count ?? r } = await setup(i), start = performance.now();
      const result = await run(), ms = performance.now() - start, value = await check(result);
      cell.signatures.push(await signature(value));
      if (i) cell.samples.push({ ms, ...(Array.isArray(result?.documents ?? result) ? { rows: (result.documents ?? result).length } : {}) });
    }
    cells.push(cell);
    console.info('CELL', engine, scale, name);
  }
  const find = (name, collection, selector, extra) => { const q = prepared(collection, selector, extra); return sample(name, 7, () => ({ run: () => instances[collection].query(q) })); };
  const grid = { $and: [{ 'payload.status': 'publish' }, { stockStatus: 'instock' }] };
  await find('products-grid-asShipped', 'products', grid);
  for (const limit of [10, 50]) await find(`products-grid-pushed-${limit}`, 'products', grid, { sort: [{ 'payload.name': 'asc' }, { uuid: 'asc' }], limit });
  await find('products-catalogue-blob', 'products', {});
  const random = rng(2144), ids = [];
  while (ids.length < 100) { const id = uuid(1 + Math.floor(random() * n)); if (!ids.includes(id)) ids.push(id); }
  for (const limit of [10, 50]) await sample(`products-findByIds-${limit}`, 7, () => ({ run: () => instances.products.findDocumentsById(ids.slice(0, limit), false), check: sorted }));
  const remote = { remoteId: { $in: ids.map(id => String(Number(id))) } };
  await find('products-remoteId-in-find', 'products', remote, { sort: [{ uuid: 'asc' }] });
  await sample('products-remoteId-in-count', 7, () => { const q = prepared('products', remote, {}, true); return { run: () => instances.products.count(q) }; });
  await sample('seed-products', 3, async i => {
    const instance = await create('products', `${databaseName}-seed-${i}`);
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
  return { cells, seedBytes, storageUsage };
};
globalThis.coldRead = async ({ engine, databaseName }) => {
  const start = performance.now(), instances = await open(engine, databaseName, ['products']);
  const docs = await instances.products.findDocumentsById([uuid(1)], false), ms = performance.now() - start;
  if (docs.length !== 1) throw new Error('Cold read missing product');
  return { ms, rows: docs.length, signature: await signature(docs) };
};
