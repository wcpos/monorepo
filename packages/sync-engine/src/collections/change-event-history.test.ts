import { Buffer } from 'node:buffer';

import { expect, it, vi } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';
import { firstValueFrom } from 'rxjs';
import { filter, timeout } from 'rxjs/operators';

import { createStoreDB, createTemporaryDB, createUserDB } from '../../../database/src/create-db';
import { createEngineHarness } from '../engine-harness';
import { resetDerivableMetadataCollection } from './engine-collections';

import type { JsonSchema, RxCollection, RxDatabase, RxDatabaseCreator } from 'rxdb';

// Memory-backed real factories; enable event-reduce to exercise its stronger query contract.
vi.mock('rxdb', async (importOriginal) => {
	const rxdb = await importOriginal<typeof import('rxdb')>();
	return {
		...rxdb,
		createRxDatabase: (options: RxDatabaseCreator) =>
			rxdb.createRxDatabase({ ...options, eventReduce: true }),
	};
});
vi.mock('../../../database/src/adapters/default', async () => {
	const { getRxStorageMemory } = await import('rxdb/plugins/storage-memory');
	return { defaultConfig: { storage: getRxStorageMemory(), multiInstance: false } };
});
vi.mock('../../../database/src/adapters/ephemeral', async () => {
	const { getRxStorageMemory } = await import('rxdb/plugins/storage-memory');
	return { ephemeralStorageConfig: { storage: getRxStorageMemory(), multiInstance: false } };
});
vi.mock('@wcpos/utils/logger', () => ({ getLogger: () => ({ error: vi.fn() }) }));
setPremiumFlag();

// 2026-09-15 soak: healthy buffers <= 1.45 MiB; coverageLanes was 6.67 MiB
// for just 13 rows. Leave headroom above healthy, not an allowlist for the offender.
const MAX_HISTORY_BYTES = 2 * 1024 * 1024;
const WRITES = 110; // Fill and roll over RxDB's default 100-event history.
type Document = Record<string, unknown>;

// Schema-shaped regression canary for new collections, not a bound on arbitrary merchant data.
function sample(field: JsonSchema<Document>, revision: number): unknown {
	if (field.enum) return field.enum[0];
	if ('default' in field && field.default !== undefined) return structuredClone(field.default);
	const type = Array.isArray(field.type) ? field.type[0] : field.type;
	switch (type) {
		case 'object':
			return Object.fromEntries(
				Object.entries(field.properties ?? {}).map(([key, value]) => [key, sample(value, revision)])
			);
		case 'array':
			return [sample((field.items ?? { type: 'string' }) as JsonSchema<Document>, revision)];
		case 'number':
		case 'integer':
			return field.minimum ?? 0;
		case 'boolean':
			return false;
		case 'null':
			return null;
		default:
			return `history-${revision}`.slice(0, field.maxLength ?? 64);
	}
}

function payload(collection: RxCollection<Document>, revision: number): Document {
	const doc = sample(collection.schema.jsonSchema, revision) as Document;
	doc[collection.schema.primaryPath] = 'history-probe';
	if (collection.name === 'coverageLanes') {
		// Catalogue-sized lane: 5,000 six-digit IDs (~45 KB), distinct arrays like persistence.ts.
		doc.expectedRecordIds = Array.from({ length: 5000 }, (_, i) => String(100000 + i + revision));
		doc.updatedAtMs = revision;
	}
	return doc;
}

function retainedBytes(collection: RxCollection<Document>): number {
	return collection._changeEventBuffer
		.getBuffer()
		.reduce(
			(bytes, event) =>
				bytes +
				[event.documentData, event.previousDocumentData].reduce(
					(sum, doc) => sum + (doc ? Buffer.byteLength(JSON.stringify(doc), 'utf8') : 0),
					0
				),
			0
		);
}

async function exercise(collection: RxCollection<Document>): Promise<number> {
	let peak = 0;
	for (let n = 0; n < WRITES; n++) {
		await collection.upsert(payload(collection, n));
		peak = Math.max(peak, retainedBytes(collection));
	}
	expect(peak, `${collection.name}: detector must observe buffered writes`).toBeGreaterThan(0);
	return peak;
}

it('app-created collections keep buffered document payloads under 2 MiB', async () => {
	const harness = await createEngineHarness({ validateSchemas: false });
	const databases: Pick<RxDatabase, 'collections' | 'remove'>[] = [];
	try {
		// Enumerate live databases; lazy search destinations have their separate pipeline test.
		for (const create of [createUserDB, () => createStoreDB('history'), createTemporaryDB]) {
			const db = await create();
			expect(db, 'app database creation failed').toBeDefined();
			databases.push(db!);
		}
		const scope = harness.engine.active()!.database;
		const measurements: Record<string, number> = {};
		for (const [group, db] of [...databases, scope].entries()) {
			for (const collection of Object.values(db.collections)) {
				const bytes = await exercise(collection);
				measurements[`${group}/${collection.name}`] = bytes;
			}
		}
		process.stdout.write(`History payload bytes: ${JSON.stringify(measurements)}\n`);
		const offenders = Object.entries(measurements)
			.filter(([, bytes]) => bytes > MAX_HISTORY_BYTES)
			.map(([name, bytes]) => `${name}: ${bytes} bytes > ${MAX_HISTORY_BYTES} bytes`);
		expect(offenders, offenders.join('\n')).toEqual([]);

		// A ledger rebuild must not silently bring the oversized history back.
		await resetDerivableMetadataCollection(scope, 'coverageLanes');
		const lanes = scope.collections.coverageLanes;
		const bytes = await exercise(lanes);
		expect(bytes, `recreated coverageLanes: ${bytes} bytes`).toBeLessThanOrEqual(MAX_HISTORY_BYTES);

		// Real findOne(...).$ observers and idle queries must catch up after history expires.
		const idle = lanes.find();
		expect(await idle.exec()).toHaveLength(1);
		const query = lanes.findOne('history-probe');
		const changed = firstValueFrom(
			query.$.pipe(
				filter((doc) => doc?.updatedAtMs === 112),
				timeout(2000)
			)
		);
		await lanes.upsert(payload(lanes, 111));
		await lanes.upsert(payload(lanes, 112));
		expect((await changed).updatedAtMs).toBe(112);
		await lanes.findOne('history-probe').remove();
		await firstValueFrom(
			query.$.pipe(
				filter((doc) => doc === null),
				timeout(2000)
			)
		);
		expect(await idle.exec()).toHaveLength(0);
	} finally {
		for (const db of databases) await db.remove();
		await harness.dispose();
	}
}, 30_000);
