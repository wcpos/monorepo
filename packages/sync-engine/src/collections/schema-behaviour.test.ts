/**
 * Schema BEHAVIOUR tests (#426) — the test surface is the modules' interface,
 * not the literals: every exported schema must (a) be accepted by real RxDB,
 * (b) round-trip a representative document through an ajv-validated
 * collection, and (c) migrate real stored documents written under its
 * PREVIOUS versions, driven by RxDB's own migration machinery (old-version
 * fixture schema → close → reopen at the current version over the SAME
 * storage). A field reorder no longer fails anything; a schema RxDB would
 * reject no longer passes.
 *
 * The four reference schemas' byte-identity (minus title) is asserted as a
 * RECORDED DECISION (ADR 0019): they are deliberately explicit as-const
 * literals, free to diverge — deliberate divergence edits that one test.
 */

import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';
// Premium stays host-side; the test harness is the host (same rationale as
// createRxdbSyncEngine.test.ts — open-core caps open collections at 13).
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';
import {
	addRxPlugin,
	createRxDatabase,
	type MigrationStrategies,
	type RxCollection,
	type RxStorage,
} from 'rxdb';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';

import {
	customerDocumentId,
	promotedOrderColumns,
	promotedProductColumns,
	referenceDocumentId,
	taxRateDocumentId,
} from '@wcpos/sync-core';
import {
	type QueuedMutation,
	recordMutationQueueMigrationStrategies,
	recordMutationQueueSchema,
} from '@wcpos/sync-core';

import { memoryEngineStorage, remoteId } from '../testing';
import { orderSchema } from './order-schema';
import { engineCollectionCreators } from './engine-collections';
import { productSchema } from './product-schema';
import { promotedVariationColumns, variationSchema } from './variation-schema';
import { customerSchema } from './customer-schema';
import { taxRateSchema } from './tax-rate-schema';
import {
	brandSchema,
	categorySchema,
	couponSchema,
	tagSchema,
} from './reference-collection-schema';
import { syncCheckpointSchema } from './sync-checkpoint-schema';
import {
	CHANGE_SIGNAL_STATE_ID,
	changeSignalStateSchema,
} from '../change-signal/change-signal-state-schema';
import {
	existenceManifestDocument,
	existenceManifestSchema,
} from '../local-coverage/existence-manifest-schema';

setPremiumFlag();
addRxPlugin(RxDBMigrationSchemaPlugin);

let dbSeq = 0;

async function openCollection(input: {
	schema: unknown;
	migrationStrategies?: MigrationStrategies;
	storage?: RxStorage<unknown, unknown>;
	dbName?: string;
}): Promise<{ db: { close(): Promise<unknown> }; collection: RxCollection }> {
	const db = await createRxDatabase({
		name: input.dbName ?? `schema-behaviour-${(dbSeq += 1)}`,
		storage: input.storage ?? memoryEngineStorage(),
		multiInstance: false,
	});
	await db.addCollections({
		docs: {
			schema: input.schema,
			...(input.migrationStrategies ? { migrationStrategies: input.migrationStrategies } : {}),
		} as never,
	});
	return { db, collection: db.collections.docs };
}

/** Round-trip: RxDB accepts the schema, and a representative doc validates and reads back. */
async function expectRoundTrip(input: {
	schema: unknown;
	migrationStrategies?: MigrationStrategies;
	document: Record<string, unknown>;
}): Promise<void> {
	const { db, collection } = await openCollection(input);
	await collection.insert(input.document);
	const read = await collection
		.findOne((input.document.uuid ?? input.document.id) as string)
		.exec();
	expect(read).not.toBeNull();
	expect(read!.toJSON()).toEqual(input.document);
	await db.close();
}

const ORDER_PAYLOAD = {
	id: 42,
	number: '1042',
	date_created_gmt: '2026-07-01T10:00:00',
	status: 'processing',
	total: '25.50',
	customer_id: 7,
};

const PRODUCT_PAYLOAD = {
	id: 9,
	price: '12.345',
	stock_status: 'instock',
	type: 'simple',
	categories: [{ id: 3 }, { id: 5 }],
	brands: [{ id: 11 }],
	on_sale: true,
	featured: false,
	stock_quantity: 3.6, // decimal-preserving on purpose (fractional stock)
};

const VARIATION_PAYLOAD = {
	id: 77,
	price: '4.20',
	stock_status: 'instock',
	attributes: [{ id: 1, name: 'Size', option: 'L' }],
	stock_quantity: null,
};

describe('every exported schema is accepted by RxDB and round-trips a representative document', () => {
	it('orders', async () => {
		await expectRoundTrip({
			schema: orderSchema,
			document: {
				uuid: 'order-uuid-42',
				remoteId: '42',
				...promotedOrderColumns(ORDER_PAYLOAD),
				payload: ORDER_PAYLOAD,
				sync: { revision: 'r1', partial: false, source: 'woo-rest' },
				local: { dirty: false, pendingMutationIds: [] },
			},
		});
	});

	it('products', async () => {
		await expectRoundTrip({
			schema: productSchema,
			document: {
				uuid: 'product-uuid-9',
				remoteId: '9',
				...promotedProductColumns(PRODUCT_PAYLOAD),
				payload: PRODUCT_PAYLOAD,
				sync: { revision: 'r1', partial: false, source: 'woo-rest' },
				local: { dirty: false, pendingMutationIds: [] },
			},
		});
	});

	it('variations', async () => {
		await expectRoundTrip({
			schema: variationSchema,
			document: {
				uuid: 'variation-uuid-77',
				remoteId: '77',
				parentRemoteId: '9',
				...promotedVariationColumns(VARIATION_PAYLOAD),
				payload: VARIATION_PAYLOAD,
				sync: { revision: 'r1', partial: false, source: 'woo-rest' },
				local: { dirty: false, pendingMutationIds: [] },
			},
		});
	});

	it('customers', async () => {
		expect(customerDocumentId(remoteId(42))).toBe('woo-customer:42');
		await expectRoundTrip({
			schema: customerSchema,
			document: {
				uuid: customerDocumentId(remoteId(42)),
				remoteId: '42',
				payload: { id: 42, date_modified_gmt: '2026-07-01T10:00:00' },
				sync: { revision: 'r1', partial: false, source: 'woo-rest' },
				local: { dirty: false, pendingMutationIds: [] },
			},
		});
	});

	it('taxRates', async () => {
		expect(taxRateDocumentId(remoteId(7))).toBe('woo-tax-rate:7');
		await expectRoundTrip({
			schema: taxRateSchema,
			document: {
				uuid: taxRateDocumentId(remoteId(7)),
				remoteId: '7',
				payload: { id: 7, rate: '10.0' },
				sync: { revision: 'r1', partial: false, source: 'woo-rest' },
			},
		});
	});

	it.each([
		['categories', categorySchema, 'woo-category'],
		['brands', brandSchema, 'woo-brand'],
		['tags', tagSchema, 'woo-tag'],
		['coupons', couponSchema, 'woo-coupon'],
	] as const)('%s', async (_name, schema, prefix) => {
		await expectRoundTrip({
			schema,
			document: {
				uuid: referenceDocumentId(prefix, remoteId(3)),
				remoteId: '3',
				payload: { id: 3, name: 'Ref' },
				sync: { revision: 'r1', partial: false, source: 'woo-rest' },
				local: { dirty: false, pendingMutationIds: [] },
			},
		});
	});

	it('syncCheckpoints', async () => {
		await expectRoundTrip({
			schema: syncCheckpointSchema,
			document: {
				checkpointKey: 'orders:custom-pull',
				checkpoint: {
					updatedAtGmt: '2026-07-01T10:00:00',
					orderId: 42,
					revision: 'r1',
					sequence: 3,
				},
				updatedAt: '2026-07-01T10:00:01.000Z',
				epoch: 'epoch-1',
			},
		});
	});

	it('changeSignalStates', async () => {
		await expectRoundTrip({
			schema: changeSignalStateSchema,
			document: {
				id: CHANGE_SIGNAL_STATE_ID,
				state: JSON.stringify({ cursor: 12 }),
				updatedAt: '2026-07-01T10:00:01.000Z',
			},
		});
	});

	it('existenceManifest', async () => {
		const row = existenceManifestDocument({
			wooId: 9,
			objectType: 'product',
			digest: '18446744073709551615',
		});
		expect(row).toEqual({
			remoteId: '9',
			wooId: 9,
			objectType: 'product',
			digest: '18446744073709551615',
		});
		await expectRoundTrip({ schema: existenceManifestSchema, document: row });
	});
});

/**
 * Real migrations: write documents under an OLD-version fixture schema (the
 * shape on disk before the promoted columns / epoch existed), close, reopen
 * the SAME storage at the current version, and let RxDB's migration plugin
 * run every strategy. This is the path a real device takes on upgrade.
 */
describe('stored documents migrate through every schema version', () => {
	it('mutation queue v1 → v2 synthesizes seq (queuedAt order preserved) and status pending (#507 regression 8)', async () => {
		// The pre-#507 durable queue schema: no seq/status/conflict fields.
		const v1FixtureSchema = {
			title: 'record mutation queue v1 fixture',
			version: 1,
			primaryKey: 'mutationId',
			type: 'object',
			properties: {
				mutationId: { type: 'string', maxLength: 64 },
				recordId: { type: 'string', maxLength: 64 },
				collectionName: { type: 'string', maxLength: 64 },
				operation: { type: 'string', enum: ['create', 'update', 'delete'] },
				origin: { type: 'string', enum: ['existing', 'server-meta', 'minted'] },
				payload: { type: 'object', additionalProperties: true },
				baseRevision: { type: ['string', 'null'] },
				queuedAt: { type: 'string', maxLength: 32 },
				attempts: { type: 'number', minimum: 0, maximum: 1_000_000, multipleOf: 1 },
				nextAttemptAt: { type: 'string', maxLength: 32 },
			},
			required: ['mutationId', 'recordId', 'collectionName', 'operation', 'payload', 'queuedAt'],
		};
		const v1Row = (mutationId: string, queuedAt: string) => ({
			mutationId,
			recordId: 'rec-A',
			collectionName: 'orders',
			operation: 'update',
			origin: 'existing',
			payload: { status: 'completed' },
			baseRevision: 'sha256:r1',
			queuedAt,
			attempts: 1,
			nextAttemptAt: '2026-07-01T10:05:00.000Z',
		});

		const storage = memoryEngineStorage();
		const dbName = `schema-migration-${(dbSeq += 1)}`;
		const old = await openCollection({
			schema: v1FixtureSchema,
			migrationStrategies: { 1: (doc) => doc },
			storage,
			dbName,
		});
		// Adversarial ids: the EARLIER row's id sorts last lexicographically.
		await old.collection.insert(v1Row('zz-early', '2026-07-01T10:00:00.000Z'));
		await old.collection.insert(v1Row('aa-late', '2026-07-01T10:00:01.000Z'));
		await old.db.close();

		const current = await openCollection({
			schema: recordMutationQueueSchema,
			migrationStrategies: recordMutationQueueMigrationStrategies as unknown as MigrationStrategies,
			storage,
			dbName,
		});
		const rows = (await current.collection.find().exec()).map(
			(doc) => doc.toJSON() as unknown as QueuedMutation
		);
		await current.db.close();

		expect(rows).toHaveLength(2);
		for (const row of rows) {
			expect(row.status).toBe('pending');
			expect(row.seq).toBeGreaterThan(0);
			expect(row).toMatchObject({ baseRevision: 'sha256:r1', attempts: 1 }); // v1 fields survive untouched
		}
		const early = rows.find((row) => row.mutationId === 'zz-early')!;
		const late = rows.find((row) => row.mutationId === 'aa-late')!;
		expect(early.seq!).toBeLessThan(late.seq!); // queuedAt order preserved despite adversarial ids
	});

	it('mutation queue v3 → v4 keeps dead letters — the rows #832 exists to recover survive the upgrade', async () => {
		// v3 is what every existing `next` profile already created. The #832 fields
		// are additive and optional, but they still change the schema HASH — and RxDB
		// keys its internal collection doc by `name-version`, so amending v3 in place
		// would throw DB6 and the scope database would not open at all. A dead letter
		// that cannot be opened is a sale that cannot be recovered, which is the whole
		// point of the feature; hence the version bump this test pins.
		const v3FixtureSchema = {
			...recordMutationQueueSchema,
			title: 'record mutation queue v3 fixture',
			version: 3,
			properties: Object.fromEntries(
				Object.entries(recordMutationQueueSchema.properties).filter(
					([key]) =>
						![
							'rejectedStatus',
							'rejectedReason',
							'rejectedMessage',
							'rejectedAt',
							'requeuedFrom',
							'requeueCount',
						].includes(key)
				)
			),
		};

		const storage = memoryEngineStorage();
		const dbName = `schema-migration-${(dbSeq += 1)}`;
		const old = await openCollection({
			schema: v3FixtureSchema,
			migrationStrategies: recordMutationQueueMigrationStrategies as unknown as MigrationStrategies,
			storage,
			dbName,
		});
		await old.collection.insert({
			mutationId: 'stranded-create',
			recordId: 'rec-A',
			collectionName: 'orders',
			operation: 'create',
			origin: 'minted',
			payload: { status: 'pos-paid', total: '25.00' },
			baseRevision: null,
			queuedAt: '2026-01-05T00:00:00.000Z',
			seq: 1,
			status: 'rejected',
		});
		await old.db.close();

		const current = await openCollection({
			schema: recordMutationQueueSchema,
			migrationStrategies: recordMutationQueueMigrationStrategies as unknown as MigrationStrategies,
			storage,
			dbName,
		});
		const rows = (await current.collection.find().exec()).map(
			(doc) => doc.toJSON() as unknown as QueuedMutation
		);
		await current.db.close();

		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			mutationId: 'stranded-create',
			status: 'rejected',
			payload: { status: 'pos-paid', total: '25.00' },
		});
		// A pre-#832 dead letter simply has no recorded reason; the UI says so
		// rather than inventing one, and the row stays requeue-able.
		expect(rows[0]?.rejectedReason).toBeUndefined();
		expect(rows[0]?.requeueCount).toBeUndefined();
	});
});

describe('schema identity — an in-place edit throws DB6 and blocks the database from opening', () => {
	/**
	 * RxDB keys its internal collection doc by `name-version`. Editing a schema without
	 * bumping `version` changes the schema hash, `addCollections` throws DB6, and the
	 * WHOLE scope database fails to open — every collection on it, not just the edited
	 * one. That is what happened to `products` in #1308 and it is invisible to every
	 * fresh-database test, so the schemas are pinned here on purpose.
	 *
	 * To change a schema: bump its `version`, add the migration strategy, and update the
	 * digest below in the same commit. The friction IS the guard.
	 */
	function canonicalJson(value: unknown): string {
		if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
		if (value && typeof value === 'object') {
			const entries = Object.entries(value as Record<string, unknown>)
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([key, val]) => `${JSON.stringify(key)}:${canonicalJson(val)}`);
			return `{${entries.join(',')}}`;
		}
		return JSON.stringify(value) ?? 'null';
	}

	/** `title` is a human label RxDB does not store shape from; everything else counts. */
	const digest = (schema: unknown) => {
		const { title: _title, ...shape } = schema as { title?: string };
		return createHash('sha256').update(canonicalJson(shape)).digest('hex').slice(0, 16);
	};

	const PINNED_DIGESTS: Record<string, string> = {
		orders: '72d3cd3ea083c10c',
		products: '914ff9bc836d2f03',
		variations: '478a682482d83df3',
		// customers and the four reference schemas share a digest: they ARE the same
		// shape apart from title (ADR 0019 — see the identity test below).
		customers: '85e1373e0643f472',
		taxRates: 'faea838bf1991ead',
		categories: '85e1373e0643f472',
		brands: '85e1373e0643f472',
		tags: '85e1373e0643f472',
		coupons: '85e1373e0643f472',
		schedulerTaskStates: '3fbf7c70726dec3c',
		coverageRecords: '3022569cc18cc7df',
		coverageLanes: '12a1f38d36ffc0d0',
		coverageCompactionLeases: '6b31b2aca59dab39',
		coverageCompactionFailures: '7bd215537ecdb03d',
		queryTotalCacheEntries: '00db9dffbd396f3c',
		queryTotalRequestStates: '184b47e2c3aae0bf',
		existenceManifest: '107bac24876b267a',
		existenceManifestCustomers: '107bac24876b267a',
		existenceManifestOrders: '107bac24876b267a',
		syncCheckpoints: '13a461c616ee12b9',
		recordMutations: '94c4fd4e440dbdd7',
		engineKv: 'a8d94dc8495e36cc',
		changeSignalStates: 'f53de19b6c426c6a',
	};

	it('every engine collection schema matches its pinned digest', () => {
		const creators = engineCollectionCreators();
		const actual = Object.fromEntries(
			Object.entries(creators).map(([name, creator]) => [name, digest(creator.schema)])
		);
		expect(actual).toEqual(PINNED_DIGESTS);
	});

	it('every versioned schema ships the migration strategies its version needs', () => {
		const creators = engineCollectionCreators();
		for (const [name, creator] of Object.entries(creators)) {
			const version = (creator.schema as { version: number }).version;
			if (version > 0) {
				expect(
					creator.migrationStrategies,
					`${name} is at v${version} but declares no migrationStrategies — RxDB cannot open an existing database without them`
				).toBeDefined();
			}
		}
	});
});

describe('reference schema identity — a recorded decision, not an accident (ADR 0019)', () => {
	it('the four reference schemas are byte-identical apart from title', () => {
		const shapeOf = ({ title: _title, ...shape }: { title: string }) => shape;
		const category = shapeOf(categorySchema);
		expect(shapeOf(brandSchema)).toEqual(category);
		expect(shapeOf(tagSchema)).toEqual(category);
		expect(shapeOf(couponSchema)).toEqual(category);
		// Deliberate divergence is an edit to THIS test plus ADR 0019's log —
		// that friction is the point; silent drift is what this catches.
	});
});
