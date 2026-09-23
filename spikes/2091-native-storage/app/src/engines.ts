import { Directory, Paths } from 'expo-file-system';
import { FileSystemDirectoryHandle } from 'expo-opfs';
import { openDatabaseAsync } from 'expo-sqlite';
import {
	type PreparedQuery,
	randomToken,
	type RxDocumentData,
	type RxJsonSchema,
} from 'rxdb/plugins/core';
import {
	ExpoFilesystemDirectory,
	getRxStorageExpoAsync,
} from 'rxdb-premium/plugins/storage-filesystem-expo';
import {
	getRxStorageSQLite,
	type RxStorageInstanceSQLite,
} from 'rxdb-premium/plugins/storage-sqlite';

import { createWorkletStorage } from './storage-runtime';
import { sqliteBasicsExpo } from './sqlite-basics-expo';

import type { Doc, Instance, Row } from './types';
export const rows: Row[] = ['expo-filesystem-js', 'worklet-filesystem', 'expo-sqlite'];
type Condition = {
	$eq?: string | number | boolean;
	$in?: (string | number)[];
	$elemMatch?: Record<string, string | { $eq: string }>;
};
type Selector = Record<string, Condition | Selector[]>;
// 2210's translated subset, unchanged: unsupported selectors still exercise premium.
function predicate(
	selector: Selector,
	params: (string | number | boolean)[],
	primary: string
): string {
	return (
		'(' +
		Object.entries(selector)
			.map(([field, raw]) => {
				if (field === '$and' || field === '$or')
					return (raw as Selector[])
						.map((s) => predicate(s, params, primary))
						.join(field === '$and' ? ' AND ' : ' OR ');
				const value = raw as Condition,
					column =
						field === '_deleted'
							? 'deleted'
							: field === primary
								? 'id'
								: `JSON_EXTRACT(data, '$.${field}')`;
				if (value.$elemMatch) {
					params.push(
						...[value.$elemMatch.key, value.$elemMatch.value].map((v) =>
							typeof v === 'string' ? v : v.$eq
						)
					);
					return `EXISTS (SELECT 1 FROM json_each(${column}) WHERE json_extract(value,'$.key') = ? AND json_extract(value,'$.value') = ?)`;
				}
				if (value.$in) {
					params.push(...value.$in);
					return `${column} IN (${value.$in.map(() => '?').join(',')})`;
				}
				params.push(value.$eq!);
				return `${column} = ?`;
			})
			.join(' AND ') +
		')'
	);
}
function translatable(selector: Selector): boolean {
	return Object.entries(selector).every(([field, raw]) => {
		if (field === '$and' || field === '$or')
			return Array.isArray(raw) && raw.length > 0 && raw.every(translatable);
		if (!/^[a-zA-Z_][\w.]*$/.test(field) || !raw || typeof raw !== 'object') return false;
		const v = raw as Condition,
			keys = Object.keys(v);
		return (
			keys.length === 1 &&
			((keys[0] === '$eq' && ['string', 'number', 'boolean'].includes(typeof v.$eq)) ||
				(keys[0] === '$in' &&
					!!v.$in?.length &&
					v.$in.every((x) => ['string', 'number'].includes(typeof x))) ||
				(keys[0] === '$elemMatch' &&
					!!v.$elemMatch &&
					Object.keys(v.$elemMatch).sort().join() === 'key,value' &&
					Object.values(v.$elemMatch).every(
						(x) => typeof (typeof x === 'string' ? x : x?.$eq) === 'string'
					)))
		);
	});
}
export async function openEngine(row: Row, dir: string, databaseName: string) {
	const directory = new Directory(Paths.document, dir);
	directory.create({ intermediates: true, idempotent: true });
	const sqliteBasics = row === 'expo-sqlite' ? sqliteBasicsExpo(directory.uri) : null;
	const storage = sqliteBasics
		? getRxStorageSQLite({ sqliteBasics, storeAttachmentsAsBase64String: true })
		: row === 'worklet-filesystem'
			? await createWorkletStorage(directory.uri.replace(/^file:\/\//, ''))
			: getRxStorageExpoAsync();
	if (row === 'expo-filesystem-js') {
		// Only relocate the raw engine's root: keep its shipped filesystem implementation/decoder/lock.
		const raw = storage as ReturnType<typeof getRxStorageExpoAsync>;
		raw.abstractFilesystem.getDirectory = async () =>
			new ExpoFilesystemDirectory(new FileSystemDirectoryHandle('run', directory.uri), true);
	}
	const instances = new Set<Instance>(),
		proofs: Record<string, unknown> = {};
	const sqlInstance = (instance: Instance) => instance as unknown as RxStorageInstanceSQLite<Doc>;
	const sql = async (instance: Instance, query: string) => {
		if (!sqliteBasics) throw new Error('Not SQL');
		const i = sqlInstance(instance),
			db = await i.internals.databasePromise;
		await i.internals.indexCreationPromise;
		return sqliteBasics.all(db, { query, params: [], context: { method: 'spike-2091', data: {} } });
	};
	const proof = async (query: string) => {
		const db = await openDatabaseAsync(databaseName, { useNewConnection: true }, directory.uri);
		try {
			return await db.getAllAsync<Record<string, string>>(query);
		} finally {
			await db.closeAsync();
		}
	};
	return {
		storage,
		sqliteBasics,
		databaseName,
		directory,
		proofs,
		sql,
		proof,
		async create<T = Doc>(
			collectionName: string,
			schema: RxJsonSchema<RxDocumentData<T>>,
			suffix = ''
		): Promise<Instance<T>> {
			const instance = (await storage.createStorageInstance({
				databaseName: databaseName + suffix,
				collectionName,
				schema,
				databaseInstanceToken: randomToken(10),
				options: {},
				multiInstance: false,
				devMode: true,
			})) as unknown as Instance<T>;
			instances.add(instance as unknown as Instance);
			if (sqliteBasics) {
				const i = sqlInstance(instance as unknown as Instance);
				await Promise.all([i.internals.databasePromise, i.internals.indexCreationPromise]);
				for (const method of ['query', 'count'] as const) {
					const original = instance[method].bind(instance);
					const translated = async (prepared: PreparedQuery<T>) => {
						const q = prepared.query,
							selector = q.selector as unknown as Selector;
						if (!translatable(selector)) return original(prepared);
						const db = await i.internals.databasePromise;
						await i.internals.indexCreationPromise;
						const params: (string | number | boolean)[] = [],
							where = predicate(selector, params, i.primaryPath),
							count = method === 'count';
						const sort = (q.sort || [])
							.map((s) =>
								Object.entries(s)
									.map(
										([k, v]) =>
											`${k === i.primaryPath ? 'id' : `JSON_EXTRACT(data, '$.${k}')`} ${v}`
									)
									.join(',')
							)
							.join(',');
						const query =
							`SELECT ${count ? 'COUNT(1) AS count' : 'data'} FROM "${i.tableName}" WHERE deleted = 0 AND ${where}` +
							(count ? '' : ` ORDER BY ${sort} LIMIT ${q.limit ?? -1} OFFSET ${q.skip ?? 0}`);
						const rows = (await sqliteBasics.all(db, {
							query,
							params,
							context: { method: 'spike-translated', data: {} },
						})) as unknown as { data: string; count: number }[];
						return count
							? { count: rows[0].count, mode: 'fast' }
							: { documents: rows.map((r: { data: string }) => JSON.parse(r.data)) };
					};
					instance[method] = translated as typeof instance.query & typeof instance.count;
				}
			}
			return instance;
		},
		async proveWal() {
			if (!sqliteBasics || proofs.wal) return;
			proofs.wal = (await proof('PRAGMA journal_mode'))[0]?.journal_mode;
			if (proofs.wal !== 'wal') throw new Error(`WAL proof failed: ${proofs.wal}`);
			proofs.sqlite = (await proof('SELECT sqlite_version() AS version'))[0].version;
		},
		async analyze<T>(instance: Instance<T>) {
			if (sqliteBasics) await sql(instance as unknown as Instance, 'ANALYZE');
		},
		async projection(instance: Instance, prepared: PreparedQuery<Doc>) {
			if (sqliteBasics)
				return sql(
					instance,
					`SELECT id, JSON_EXTRACT(data,'$.payload.name') AS name, JSON_EXTRACT(data,'$.payload.sku') AS sku, JSON_EXTRACT(data,'$.payload.global_unique_id') AS gid FROM "${sqlInstance(instance).tableName}" WHERE deleted = 0`
				);
			return (await instance.query(prepared)).documents.map((d) => ({
				id: d.uuid,
				name: d.payload.name,
				sku: d.payload.sku,
				gid: d.payload.global_unique_id,
			}));
		},
		async close() {
			for (const instance of instances)
				if (!(instance as Instance & { closed?: boolean }).closed) await instance.close();
		},
	};
}
export type Session = Awaited<ReturnType<typeof openEngine>>;
