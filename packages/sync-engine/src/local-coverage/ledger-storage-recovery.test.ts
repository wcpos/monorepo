// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addRxPlugin, createRxDatabase, type RxDatabase } from 'rxdb';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

import type { SyncEvent } from '@wcpos/sync-core';

import { engineCollectionCreators } from '../collections/engine-collections';
import { createLocalCoverage } from './local-coverage';
import { RxCoverageRepository } from './persistence';
import { isReconciliationRefusalError } from './ledger-storage-recovery';

addRxPlugin(RxDBMigrationSchemaPlugin);

const CORRUPTION_REFUSALS = [
	'unsorted-primary',
	'duplicate-primary-id:categories::woo-category:16',
	'id-set-mismatch:orders::woo-order:42',
	'no-healthy-secondary',
	'primary-row-mismatch:products::woo-product:7',
	'duplicate-primary-range:customers::woo-customer:9',
	'uncorroborated-primary-range:tags::woo-tag:3',
	'overlapping-ranges',
] as const;

const refusalError = (reason: string) =>
	new SyntaxError(
		`SyntaxError: Unexpected token 'r', "records" is not valid JSON; index reconciliation refused: ${reason}`
	);

describe('isReconciliationRefusalError', () => {
	it.each(CORRUPTION_REFUSALS)('classifies the corruption refusal %s', (reason) => {
		expect(isReconciliationRefusalError(refusalError(reason))).toBe(true);
	});

	it.each(['no-divergence', 'multi-instance'])(
		'does not classify the non-corruption refusal %s',
		(reason) => {
			expect(isReconciliationRefusalError(refusalError(reason))).toBe(false);
		}
	);

	it.each([
		new SyntaxError('Unexpected token \'r\', "records" is not valid JSON'),
		new Error('Network request failed'),
	])('does not classify unrelated errors', (error) => {
		expect(isReconciliationRefusalError(error)).toBe(false);
	});
});

const LEDGER_COLLECTIONS = ['coverageRecords', 'coverageLanes', 'schedulerTaskStates'] as const;

let databaseSequence = 0;
let openDatabase: RxDatabase | undefined;

afterEach(async () => {
	vi.restoreAllMocks();
	await openDatabase?.close();
	openDatabase = undefined;
});

describe('coverage ledger recovery', () => {
	it('rebuilds the whole ledger once, refreshes the repository, observes it, and retries once', async () => {
		const db = await createRxDatabase({
			name: `ledgerrecovery${(databaseSequence += 1)}`,
			storage: getRxStorageMemory(),
			multiInstance: false,
		});
		openDatabase = db;
		const creators = engineCollectionCreators();
		await db.addCollections(
			Object.fromEntries(LEDGER_COLLECTIONS.map((name) => [name, creators[name]])) as never
		);
		const events: SyncEvent[] = [];
		const coverage = createLocalCoverage({
			database: db as never,
			diagnostics: (event) => events.push(event),
			now: () => 1_000,
			freshForMs: 500,
		});

		await coverage.recordQueryResult({
			collection: 'orders',
			queryKey: 'orders:open',
			records: [{ id: 'woo-order:1' }],
			complete: true,
		});
		await db.collections.schedulerTaskStates.insert({
			stateKey: 'task-orders',
			taskId: 'task-orders',
			requirementId: 'requirement-orders',
			collectionName: 'orders',
			queryKey: 'orders:open',
			limit: 100,
			priority: 500,
			mode: 'windowed',
			status: 'completed',
			ownerId: null,
			claimedUntilMs: null,
			attempt: 1,
			retryAfterMs: null,
			updatedAtMs: 1,
			schemaVersion: 4,
		});
		for (const name of LEDGER_COLLECTIONS) {
			await expect(db.collections[name].count().exec()).resolves.toBe(1);
		}
		const originalCollections = new Map(
			LEDGER_COLLECTIONS.map((name) => [name, db.collections[name]])
		);

		const firstError = refusalError('duplicate-primary-id:categories::woo-category:16');
		const read = vi
			.spyOn(RxCoverageRepository.prototype, 'readCoverageDocuments')
			.mockRejectedValueOnce(firstError);

		await expect(coverage.readSnapshot()).resolves.toEqual({
			records: [],
			lanes: [],
		});
		expect(read).toHaveBeenCalledTimes(2);
		expect(read.mock.contexts[1]).not.toBe(read.mock.contexts[0]);
		for (const name of LEDGER_COLLECTIONS) {
			expect(db.collections[name]).not.toBe(originalCollections.get(name));
			await expect(db.collections[name].count().exec()).resolves.toBe(0);
		}
		expect(events).toContainEqual({
			type: 'coverage.ledger-rebuilt',
			level: 'warn',
			fields: { reason: 'duplicate-primary-id:categories::woo-category:16' },
		});

		const rebuiltCollections = new Map(
			LEDGER_COLLECTIONS.map((name) => [name, db.collections[name]])
		);
		const secondError = refusalError('unsorted-primary');
		read.mockRejectedValueOnce(secondError);
		await expect(coverage.readSnapshot()).rejects.toBe(secondError);
		expect(read).toHaveBeenCalledTimes(3);
		expect(read.mock.contexts[2]).toBe(read.mock.contexts[1]);
		for (const name of LEDGER_COLLECTIONS) {
			expect(db.collections[name]).toBe(rebuiltCollections.get(name));
		}
		expect(events.filter((event) => event.type === 'coverage.ledger-rebuilt')).toHaveLength(1);
	});
});
