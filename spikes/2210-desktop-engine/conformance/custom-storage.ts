/* eslint-disable import/no-unresolved -- this file is copied over test/unit/custom-storage.ts
   inside the rxdb clone by run-conformance.sh; its imports resolve there, not here. */
import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

import { getRxStorageSQLite, getSQLiteBasicsNodeNative } from 'rxdb-premium/plugins/storage-sqlite';

import { isNode } from '../../plugins/test-utils/index.mjs';
import { wrappedValidateAjvStorage } from '../../plugins/validate-ajv/index.mjs';
import { fillWithDefaultSettings } from '../../plugins/core/index.mjs';

import type { RxTestStorage } from '../../plugins/core/index.mjs';
let storage: ReturnType<RxTestStorage['getStorage']>;
export const CUSTOM_STORAGE: RxTestStorage = {
	name: 'sqlite-node-native',
	async init() {
		if (!isNode) throw new Error('spike-2210 conformance is Node only');
		const { DatabaseSync } = await import('node:sqlite');
		const dir = resolve('../../.data/conformance/sqlite-node', randomUUID());
		const sqliteBasics = getSQLiteBasicsNodeNative(DatabaseSync),
			open = sqliteBasics.open;
		sqliteBasics.open = async (name) => {
			const path = join(dir, name);
			await mkdir(dirname(path), { recursive: true });
			const db = await open(path);
			db.exec('PRAGMA synchronous = NORMAL');
			return db;
		};
		const raw = getRxStorageSQLite({ sqliteBasics, storeAttachmentsAsBase64String: true });
		const databaseName = 'runtime-' + randomUUID();
		const probe = await raw.createStorageInstance({
			databaseName,
			collectionName: 'proof',
			schema: fillWithDefaultSettings({
				version: 0,
				primaryKey: 'id',
				type: 'object',
				properties: { id: { type: 'string', maxLength: 64 } },
				required: ['id'],
			}),
			databaseInstanceToken: randomUUID(),
			options: {},
			multiInstance: false,
			devMode: false,
		});
		await probe.internals.databasePromise;
		await probe.internals.indexCreationPromise;
		const proof = new DatabaseSync(join(dir, databaseName), { readOnly: true });
		try {
			const mode = proof.prepare('PRAGMA journal_mode').get()?.journal_mode;
			if (mode !== 'wal') throw new Error(`WAL proof failed: ${mode}`);
			const sqlite = proof.prepare('SELECT sqlite_version() AS v').get()?.v;
			console.info(
				`spike-2210 runtime: electron=${process.versions.electron} node=${process.versions.node} sqlite=${sqlite} journal_mode=${mode}`
			);
		} finally {
			proof.close();
			await probe.close();
		}
		storage = raw;
	},
	getStorage() {
		return wrappedValidateAjvStorage({ storage });
	},
	getPerformanceStorage() {
		return { description: 'sqlite-node-native', storage: CUSTOM_STORAGE.getStorage() };
	},
	hasPersistence: true,
	hasMultiInstance: true,
	hasAttachments: true,
	hasReplication: true,
};
