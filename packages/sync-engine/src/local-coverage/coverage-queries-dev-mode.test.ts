// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { addRxPlugin, createRxDatabase, type RxDatabase } from 'rxdb';
import { disableWarnings, RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateZSchemaStorage } from 'rxdb/plugins/validate-z-schema';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { engineCollectionCreators } from '../collections/engine-collections';
import { createLocalCoverage } from './local-coverage';

/**
 * COVERAGE QUERIES UNDER RxDB DEV-MODE (#1368).
 *
 * Every coverage query must be servable from a declared index: dev-mode's
 * `checkQuery` rejects a sort the schema cannot serve (QU13), and dev-mode is
 * exactly what the app runs under `__DEV__` (packages/database registers the
 * plugin there). No other test file loads the plugin — which is how a sort on
 * the non-existent `id` field (the schema's field is `documentId`) shipped and
 * crashed the coverage-compaction lane on every tick for a month.
 *
 * The plugin is GLOBAL per test worker, so it lives in this dedicated file. A
 * QU13 failure here means someone broke a coverage sort against the schema.
 */
disableWarnings();
addRxPlugin(RxDBDevModePlugin);
setPremiumFlag();
addRxPlugin(RxDBMigrationSchemaPlugin);

const COVERAGE_COLLECTIONS = ['coverageRecords', 'coverageLanes'] as const;

let databaseSequence = 0;
let openDatabase: RxDatabase | undefined;

afterEach(async () => {
	await openDatabase?.close();
	openDatabase = undefined;
});

async function openCoverage() {
	const db = await createRxDatabase({
		name: `coveragedevmode${(databaseSequence += 1)}`,
		// Dev-mode refuses an unvalidated storage (DVM1); z-schema is the app's
		// dev validator (packages/database adapters).
		storage: wrappedValidateZSchemaStorage({ storage: getRxStorageMemory() }),
		multiInstance: false,
	});
	openDatabase = db;
	const creators = engineCollectionCreators();
	await db.addCollections(
		Object.fromEntries(COVERAGE_COLLECTIONS.map((name) => [name, creators[name]])) as never
	);
	return createLocalCoverage({
		database: db as never,
		diagnostics: () => {},
		now: () => 1_000,
		freshForMs: 500,
	});
}

describe('coverage queries under dev-mode checkQuery', () => {
	it('reads the snapshot and lane listing across collections without a QU13 rejection', async () => {
		const coverage = await openCoverage();
		await coverage.recordQueryResult({
			collection: 'products',
			queryKey: 'products:browser:status=all:search=:limit=100',
			records: [{ id: 'woo-product:2' }, { id: 'woo-product:1' }],
			complete: true,
		});
		await coverage.recordQueryResult({
			collection: 'orders',
			queryKey: 'orders:browser:status=all:search=:limit=100',
			records: [{ id: 'woo-order:1' }],
			complete: true,
		});

		// readSnapshot() is repository.readCoverageDocuments() — the query the
		// compaction lane (and every reader above it) goes through.
		const snapshot = await coverage.readSnapshot();
		expect(snapshot.records.map((record) => record.documentId)).toEqual([
			'woo-order:1',
			'woo-product:1',
			'woo-product:2',
		]);
		expect(snapshot.lanes.map((lane) => lane.queryKey)).toEqual([
			'orders:browser:status=all:search=:limit=100',
			'products:browser:status=all:search=:limit=100',
		]);

		// The one-collection lane listing sorts on the same declared index.
		await expect(coverage.listLanes('products')).resolves.toEqual([
			expect.objectContaining({ queryKey: 'products:browser:status=all:search=:limit=100' }),
		]);
	});
});
