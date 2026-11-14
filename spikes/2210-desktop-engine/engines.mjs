import { getRxStorageAbstractFilesystem } from 'rxdb-premium/plugins/storage-abstract-filesystem';
import { NodeFilesystem } from 'rxdb-premium/plugins/storage-filesystem-node';
import { getRxStorageSQLite } from 'rxdb-premium/plugins/storage-sqlite';
import { randomToken } from 'rxdb/plugins/core';
import { DatabaseSync } from 'node:sqlite';
import { mkdir, readFile } from 'node:fs/promises';
import { arch, cpus, platform, release } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sqliteBasicsNodeNative } from './sqlite-basics-node-native.mjs';
import { createStorageLock } from './storage-lock.mjs';
export const rows = ['filesystem-node', 'sqlite-node'];
const here = dirname(fileURLToPath(import.meta.url));
export const directory = basename(here) === '.build' ? dirname(here) : here;
export async function environment() {
  const versions = JSON.parse(await readFile(join(directory, '.build/versions.json'), 'utf8'));
  const db = new DatabaseSync(':memory:');
  const sqlite = db.prepare('SELECT sqlite_version() AS v').get().v; db.close();
  return { os: `${platform()} ${release()} ${arch()}`, platform: platform() === 'win32' ? 'windows' : 'mac',
    cpu: cpus()[0].model, node: process.versions.node, sqlite, ...versions, measuredAt: new Date().toISOString() };
}
// Copied from 2145; the guard below restricts it to the operators used in this workload.
function predicate(selector, params, primary) {
	return (
		'(' +
		Object.entries(selector)
			.map(([field, value]) => {
				if (field === '$and' || field === '$or')
					return value.map((s) => predicate(s, params, primary)).join(field === '$and' ? ' AND ' : ' OR ');
				const column = field === '_deleted' ? 'deleted' : field === primary ? 'id' : `JSON_EXTRACT(data, '$.${field}')`;
				if (value.$regex !== undefined) {
					// buildScanSearchSelector regex-escapes the typed term (`0\.4`, `K\-2`): undo that,
					// then escape the SQL wildcards so the pattern is a literal substring match.
					const term = value.$regex.replace(/\\(.)/g, '$1');
					if (value.$options === 'i') {
						params.push('%' + term.replace(/[\\%_]/g, '\\$&') + '%');
						return `${column} LIKE ? ESCAPE '\\'`;
					}
					params.push('*' + term.replace(/[*?[]/g, '[$&]') + '*');
					return `${column} GLOB ?`;
				}
				if (value.$elemMatch) {
					params.push(...[value.$elemMatch.key, value.$elemMatch.value].map((v) => v.$eq ?? v));
					return `EXISTS (SELECT 1 FROM json_each(${column}) WHERE json_extract(value,'$.key') = ? AND json_extract(value,'$.value') = ?)`;
				}
				if (value.$in) {
					params.push(...value.$in);
					return `${column} IN (${value.$in.map(() => '?').join(',')})`;
				}
				params.push(value.$eq ?? value);
				return `${column} = ?`;
			})
			.join(' AND ') +
		')'
	);
}
function translatable(selector) {
  return Object.entries(selector).every(([field, v]) => {
    if (field === '$and' || field === '$or') return v.length > 0 && v.every(translatable);
    if (!/^[a-zA-Z_][\w.]*$/.test(field) || !v || typeof v !== 'object') return false;
    const keys = Object.keys(v);
    return keys.length === 1 && (keys[0] === '$eq' && ['string', 'number', 'boolean'].includes(typeof v.$eq)
      || keys[0] === '$in' && v.$in.length > 0 && v.$in.every(x => ['string', 'number'].includes(typeof x))
      || keys[0] === '$elemMatch' && Object.keys(v.$elemMatch).sort().join() === 'key,value'
        && Object.values(v.$elemMatch).every(x => typeof (x?.$eq ?? x) === 'string'));
  });
}
export async function openEngine(row, dir, name) {
  if (!rows.includes(row)) throw new Error(`Unknown row: ${row}`);
  await mkdir(dir, { recursive: true });
  const sqliteBasics = row === 'sqlite-node' ? sqliteBasicsNodeNative() : null;
  const storage = sqliteBasics ? getRxStorageSQLite({ sqliteBasics, storeAttachmentsAsBase64String: true })
    : getRxStorageAbstractFilesystem({ name: 'filesystem-node', abstractFilesystem: new NodeFilesystem(dir), abstractLock: createStorageLock(), inWorker: false });
  const instances = new Set(), databaseName = sqliteBasics ? join(dir, name) : name;
  let wal = null;
  const sql = async (instance, query) => {
    const db = await instance.internals.databasePromise;
    await instance.internals.indexCreationPromise;
    return sqliteBasics.all(db, { query, params: [], context: { method: 'spike-2210', data: {} } });
  };
  return {
    storage, sqliteBasics, databaseName, get wal() { return wal; }, sql,
    async create(collectionName, schema, suffix = '') {
      const instance = await storage.createStorageInstance({ databaseName: databaseName + suffix, collectionName, schema,
        databaseInstanceToken: randomToken(10), options: {}, multiInstance: false, devMode: true });
      instances.add(instance);
      if (sqliteBasics) {
        await Promise.all([instance.internals.databasePromise, instance.internals.indexCreationPromise]);
  for (const method of ['query', 'count']) {
    const original = instance[method].bind(instance);
    instance[method] = async prepared => {
      const q = prepared.query;
      if (!translatable(q.selector)) return original(prepared);
      const db = await instance.internals.databasePromise;
      await instance.internals.indexCreationPromise;
      const params = [], where = predicate(q.selector, params, instance.primaryPath), count = method === 'count';
      const sort = (q.sort || []).map(s => Object.entries(s).map(([k, v]) => `${k === instance.primaryPath ? 'id' : `JSON_EXTRACT(data, '$.${k}')`} ${v}`).join(',')).join(',');
      const query = `SELECT ${count ? 'COUNT(1) AS count' : 'data'} FROM "${instance.tableName}" WHERE deleted = 0 AND ${where}`
        + (count ? '' : ` ORDER BY ${sort} LIMIT ${q.limit ?? -1} OFFSET ${q.skip ?? 0}`);
      const rows = await sqliteBasics.all(db, { query, params, context: { method: 'spike-translated', data: {} } });
      return count ? { count: rows[0].count, mode: 'fast' } : { documents: rows.map(r => JSON.parse(r.data)) };
    };
  }
      }
      return instance;
    },
    proveWal() {
      if (!sqliteBasics || wal) return;
      const proof = new DatabaseSync(databaseName, { readOnly: true });
      try { wal = proof.prepare('PRAGMA journal_mode').get().journal_mode; } finally { proof.close(); }
      if (wal !== 'wal') throw new Error(`WAL proof failed: ${wal}`);
      console.error(`spike-2210 WAL proof: ${row} journal_mode=${wal}`);
    },
    async analyze(instance) { if (sqliteBasics) await sql(instance, 'ANALYZE'); },
    async projection(instance, prepared) {
      if (sqliteBasics) return sql(instance, `SELECT id, JSON_EXTRACT(data,'$.payload.name') AS name, JSON_EXTRACT(data,'$.payload.sku') AS sku, JSON_EXTRACT(data,'$.payload.global_unique_id') AS gid FROM "${instance.tableName}" WHERE deleted = 0`);
      return (await instance.query(prepared)).documents.map(d => ({ id: d.uuid, name: d.payload.name, sku: d.payload.sku, gid: d.payload.global_unique_id }));
    },
    async close() { for (const instance of instances) if (!instance.closed) await instance.close(); },
  };
}
