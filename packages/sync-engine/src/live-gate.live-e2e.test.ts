import { afterAll, describe, expect, it } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import {
	createRxdbSyncEngine,
	type EngineEvent,
	type RxdbSyncEngine,
} from './create-rxdb-sync-engine';
import { createConfigFingerprintLiveSource } from './change-signal/config-fingerprint-source';
import { memoryEngineStorage } from './testing';

const LIVE_SYNC_BASE = process.env['LIVE_SYNC_BASE']?.trim();
const LIVE_BASIC_AUTH = process.env['LIVE_BASIC_AUTH']?.trim();
const LIVE_ENABLED = Boolean(LIVE_SYNC_BASE && LIVE_BASIC_AUTH);

if (!LIVE_ENABLED) {
	console.log(
		'[live-sync-gate] skipped: set LIVE_SYNC_BASE and LIVE_BASIC_AUTH to run the real-server gate'
	);
}

const liveDescribe = LIVE_ENABLED ? describe : describe.skip;

type JsonDocument = { toJSON(): Record<string, unknown> };
type Evidence = { step: string; outcome: string };

const BOOTSTRAP_LANES = [
	{ collection: 'taxRates', queryKey: 'taxRates:all' },
	{ collection: 'categories', queryKey: 'categories:all' },
	{ collection: 'brands', queryKey: 'brands:all' },
	{ collection: 'tags', queryKey: 'tags:all' },
	{ collection: 'coupons', queryKey: 'coupons:all' },
] as const;

function withoutTrailingSlashes(value: string): string {
	let result = value;
	while (result.endsWith('/')) result = result.slice(0, -1);
	return result;
}

function liveSite(syncBaseUrl: string): {
	syncBaseUrl: string;
	wpJsonRoot: string;
	scopeSite: string;
} {
	const normalized = withoutTrailingSlashes(syncBaseUrl);
	const namespace = '/wcpos/v2';
	if (!normalized.endsWith(namespace)) {
		throw new Error(`LIVE_SYNC_BASE must end in "${namespace}"`);
	}
	const wpJsonRoot = `${normalized.slice(0, -namespace.length)}/`;
	return {
		syncBaseUrl: normalized,
		wpJsonRoot,
		scopeSite: new URL(wpJsonRoot).origin,
	};
}

function liveProductId(): number | null {
	const raw = process.env['LIVE_PRODUCT_ID']?.trim();
	if (!raw) return null;
	const id = Number(raw);
	if (!Number.isSafeInteger(id) || id <= 0) {
		throw new Error('LIVE_PRODUCT_ID must be a positive integer when set');
	}
	return id;
}

function authenticatedFetcher(basicAuth: string) {
	return async (url: string, init?: RequestInit): Promise<Response> => {
		const headers = new Headers(init?.headers ?? {});
		headers.set('X-WCPOS', '1');
		headers.set('Authorization', `Basic ${basicAuth}`);
		return globalThis.fetch(url, { ...init, headers });
	};
}

async function collectionRows(engine: RxdbSyncEngine, collectionName: string) {
	const scope = engine.active();
	if (!scope) throw new Error('live gate has no active engine scope');
	const collection = scope.database.collections[collectionName];
	if (!collection) throw new Error(`live gate collection "${collectionName}" is unavailable`);
	const documents = (await collection.find().exec()) as JsonDocument[];
	return documents.map((document) => document.toJSON());
}

async function productByWooId(
	engine: RxdbSyncEngine,
	wooProductId: number
): Promise<Record<string, unknown> | null> {
	const scope = engine.active();
	if (!scope) throw new Error('live gate has no active engine scope');
	const documents = (await scope.database.collections.products
		.find({ selector: { wooProductId } })
		.exec()) as JsonDocument[];
	return documents[0]?.toJSON() ?? null;
}

function uuidMetadata(payload: Record<string, unknown>): string | null {
	const metadata = Array.isArray(payload['meta_data']) ? payload['meta_data'] : [];
	const identity = metadata.find(
		(entry) =>
			typeof entry === 'object' &&
			entry !== null &&
			(entry as Record<string, unknown>)['key'] === '_woocommerce_pos_uuid'
	) as Record<string, unknown> | undefined;
	return typeof identity?.['value'] === 'string' ? identity['value'] : null;
}

async function insertBornLocalOrder(
	engine: RxdbSyncEngine,
	recordId: string,
	payload: Record<string, unknown>
): Promise<void> {
	const scope = engine.active();
	if (!scope) throw new Error('live gate has no active engine scope');
	await scope.database.collections.orders.insert({
		id: recordId,
		wooOrderId: null,
		number: '',
		dateCreatedGmt: String(payload['date_created_gmt'] ?? ''),
		status: String(payload['status'] ?? ''),
		total: String(payload['total'] ?? ''),
		customerId: Number(payload['customer_id'] ?? 0),
		payload,
		sync: { revision: '', partial: false, source: 'skeleton' },
		local: { dirty: false, pendingMutationIds: [] },
	});
}

async function orderByRecordId(
	engine: RxdbSyncEngine,
	recordId: string
): Promise<Record<string, unknown> | null> {
	const scope = engine.active();
	if (!scope) throw new Error('live gate has no active engine scope');
	const document = (await scope.database.collections.orders
		.findOne(recordId)
		.exec()) as JsonDocument | null;
	return document?.toJSON() ?? null;
}

function evidenceTable(evidence: readonly Evidence[]): string {
	const stepWidth = Math.max('step'.length, ...evidence.map(({ step }) => step.length));
	const header = `${'step'.padEnd(stepWidth)} | outcome`;
	const rule = `${'-'.repeat(stepWidth)}-+--------`;
	return [
		header,
		rule,
		...evidence.map(({ step, outcome }) => `${step.padEnd(stepWidth)} | ${outcome}`),
	].join('\n');
}

liveDescribe('LIVE sync-engine sale-ready gate', () => {
	const evidence: Evidence[] = [];
	let engine: RxdbSyncEngine | null = null;

	afterAll(async () => {
		try {
			if (engine) await engine.dispose();
		} finally {
			console.log(`\n[live-sync-gate] evidence\n${evidenceTable(evidence)}`);
		}
	});

	it('boots Tier 0, requires a product, reads config digests, writes an order, and verifies it on the server', async () => {
		// The live harness is the host; production engine code does not import Premium.
		setPremiumFlag();
		const syncBaseUrl = LIVE_SYNC_BASE as string;
		const basicAuth = LIVE_BASIC_AUTH as string;
		const site = liveSite(syncBaseUrl);
		const fetcher = authenticatedFetcher(basicAuth);
		const productId = liveProductId();

		engine = createRxdbSyncEngine(
			{
				site: { syncBaseUrl: site.syncBaseUrl, wpJsonRoot: site.wpJsonRoot },
				storage: memoryEngineStorage(),
				fetcher,
				mode: 'manual',
				multiInstance: false,
			},
			{
				site: site.scopeSite,
				storeId: 'live-sync-gate',
				cashierId: 'live-sync-gate',
			}
		);

		await engine.ready;
		expect(engine.status()).toMatchObject({ gatedBy: null, connectivity: 'online' });

		const bootstrap = await engine.sync('scheduler-drain');
		expect(bootstrap).toMatchObject({ lane: 'scheduler-drain', status: 'ran' });
		expect(bootstrap.error).toBeUndefined();

		const [tasks, coverage] = await Promise.all([
			collectionRows(engine, 'schedulerTaskStates'),
			collectionRows(engine, 'coverageLanes'),
		]);
		for (const lane of BOOTSTRAP_LANES) {
			expect(tasks).toContainEqual(
				expect.objectContaining({
					collectionName: lane.collection,
					queryKey: lane.queryKey,
					status: 'completed',
				})
			);
			expect(coverage).toContainEqual(
				expect.objectContaining({
					collectionName: lane.collection,
					queryKey: lane.queryKey,
					complete: true,
				})
			);
		}
		evidence.push({
			step: 'tier-0 seed',
			outcome: `${BOOTSTRAP_LANES.length}/${BOOTSTRAP_LANES.length} lanes completed with coverage`,
		});

		if (productId !== null) {
			const requirement = await engine.require({
				id: 'live-gate-product',
				collection: 'products',
				kind: 'targeted-records',
				wooIds: [productId],
				forceRefresh: true,
				priority: 1_000,
			}).ready;
			expect(requirement.action).toBe('fetched');

			const product = await productByWooId(engine, productId);
			expect(product).not.toBeNull();
			const productPayload = product?.['payload'] as Record<string, unknown> | undefined;
			const productUuid = productPayload ? uuidMetadata(productPayload) : null;
			const productRevision = (product?.['sync'] as { revision?: unknown } | undefined)?.revision;
			expect(productUuid).toEqual(expect.any(String));
			expect(productUuid).toBe(product?.['id']);
			expect(productRevision).toEqual(expect.any(String));
			expect(String(productRevision)).not.toHaveLength(0);
			evidence.push({
				step: 'targeted product',
				outcome: `product ${productId} resident with uuid + revision`,
			});
		} else {
			evidence.push({
				step: 'targeted product',
				outcome: 'not requested (LIVE_PRODUCT_ID unset)',
			});
		}

		const transport = engine.hostTransport();
		const configSource = createConfigFingerprintLiveSource({
			syncBaseUrl: transport.syncBaseUrl,
			fetcher: transport.fetcher,
		});
		const config = await configSource.pollConfigFingerprints();
		for (const collection of ['products', 'variations', 'tax_rates'] as const) {
			expect(config.fingerprints[collection]).toEqual(expect.any(String));
			expect(config.fingerprints[collection]).not.toHaveLength(0);
			const barcodeFields = config.barcodeFields?.[collection];
			if (barcodeFields) {
				expect(barcodeFields.every((field) => typeof field === 'string')).toBe(true);
			}
		}
		evidence.push({
			step: 'config digests',
			outcome: 'products + variations + tax_rates fingerprints well formed',
		});

		const orderRecordId = globalThis.crypto.randomUUID();
		const lineRecordId = globalThis.crypto.randomUUID();
		const createdAtGmt = new Date().toISOString().replace(/\.\d{3}Z$/, '');
		const payload: Record<string, unknown> = {
			status: 'pos-open',
			created_via: 'woocommerce-pos',
			customer_id: 0,
			date_created_gmt: createdAtGmt,
			date_modified_gmt: createdAtGmt,
			meta_data: [{ key: '_woocommerce_pos_uuid', value: orderRecordId }],
			...(productId !== null
				? {
						line_items: [
							{
								product_id: productId,
								quantity: 1,
								meta_data: [{ key: '_woocommerce_pos_uuid', value: lineRecordId }],
							},
						],
					}
				: {
						fee_lines: [
							{
								name: 'Live sync gate',
								tax_status: 'none',
								total: '0.01',
								meta_data: [{ key: '_woocommerce_pos_uuid', value: lineRecordId }],
							},
						],
					}),
		};
		await insertBornLocalOrder(engine, orderRecordId, payload);

		const writeEvents: EngineEvent[] = [];
		const unsubscribe = engine.events((event) => writeEvents.push(event));
		const receipt = await engine.write({
			collection: 'orders',
			operation: 'create',
			recordId: orderRecordId,
			payload,
		});
		const drain = await engine.sync('write-drain');
		unsubscribe();
		expect(drain).toMatchObject({
			lane: 'write-drain',
			status: 'ran',
			pushed: 1,
			conflicts: 0,
			failed: 0,
			rejected: 0,
		});
		expect(engine.status().queueDepth).toBe(0);
		expect(await engine.conflicts()).toEqual([]);

		const acknowledged = writeEvents.find(
			(event) => event.type === 'write-acknowledged' && event.mutationId === receipt.mutationId
		);
		expect(acknowledged).toMatchObject({
			type: 'write-acknowledged',
			collection: 'orders',
			recordId: orderRecordId,
			mutationId: receipt.mutationId,
		});

		const order = await orderByRecordId(engine, orderRecordId);
		const wooOrderId = order?.['wooOrderId'];
		const orderRevision = (order?.['sync'] as { revision?: unknown } | undefined)?.revision;
		expect(wooOrderId).toEqual(expect.any(Number));
		expect(Number.isSafeInteger(wooOrderId) && Number(wooOrderId) > 0).toBe(true);
		expect(orderRevision).toEqual(expect.any(String));
		expect(String(orderRevision)).not.toHaveLength(0);
		if (acknowledged?.type === 'write-acknowledged') {
			expect(acknowledged.currentRevision).toBe(orderRevision);
		}
		evidence.push({
			step: 'order write',
			outcome: `acknowledged as Woo order ${String(wooOrderId)} with revision`,
		});

		const verifyResponse = await transport.fetcher(
			`${transport.syncBaseUrl}/orders?include=${String(wooOrderId)}`
		);
		expect(verifyResponse.ok).toBe(true);
		const serverOrders = (await verifyResponse.json()) as unknown;
		expect(Array.isArray(serverOrders)).toBe(true);
		expect(
			(serverOrders as Record<string, unknown>[]).some(
				(serverOrder) => serverOrder['id'] === wooOrderId
			)
		).toBe(true);
		evidence.push({
			step: 'server verify',
			outcome: `GET /orders?include=${String(wooOrderId)} returned the order`,
		});
	}, 120_000);
});
