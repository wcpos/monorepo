import { assertBulkSuccess, type RemoteId, wooIdOf } from '@wcpos/sync-core';

import { forEachYielding } from '../event-loop-yield';
import { chunk } from '../scheduler';
import { hasPendingLocalWork } from '../write-path/local-work-guard';
import {
	existenceManifestDocument,
	type ExistenceManifestDocument,
} from './existence-manifest-schema';
import { upsertManifestRows } from './rx-existence-manifest-repository';

/** Structural collection slices the primes read — LabDatabase and engine scope dbs both satisfy them. */
type CountFindCollection<TDoc> = {
	count(): { exec(): Promise<number> };
	find(): { exec(): Promise<TDoc[]> };
};
/** Keyed re-read, so a decision taken across a yield can be re-validated against current state. */
type FindByIdsCollection<TDoc> = {
	findByIds(ids: string[]): { exec(): Promise<Map<string, TDoc>> };
};
type PrimeProductDocument = {
	primary: string;
	remoteId?: RemoteId | null;
	payload?: { status?: unknown };
	local?: { dirty?: boolean; pendingMutationIds?: unknown[] };
};
type PrimeManifestCollection = {
	bulkUpsert(docs: ExistenceManifestDocument[]): Promise<unknown>;
	bulkRemove(ids: string[]): Promise<unknown>;
	count(): { exec(): Promise<number> };
	find(query?: unknown): {
		exec(): Promise<{ toJSON(): ExistenceManifestDocument; wooId: number }[]>;
	};
};

/** Structural: the collections the boot primes touch. */
export type ExistenceManifestPrimeDatabase = {
	existenceManifest: PrimeManifestCollection;
	existenceManifestCustomers: PrimeManifestCollection;
	existenceManifestOrders: PrimeManifestCollection;
	products: CountFindCollection<PrimeProductDocument> &
		FindByIdsCollection<PrimeProductDocument> & {
			bulkRemove(ids: string[]): Promise<unknown>;
		};
	variations: CountFindCollection<{ remoteId?: RemoteId | null }>;
	customers: CountFindCollection<{ remoteId?: RemoteId | null }>;
	orders: CountFindCollection<{ toJSON(): unknown }>;
};

/**
 * Leg-3 prime pass (ADR 0014 increment 4c-client). Records synced BEFORE Leg 3 shipped carry no
 * existenceManifest row; without this backfill the first reconcile audit would read every such id as a
 * server-vs-local mismatch and re-pull the whole catalog. This seeds their manifest rows directly from
 * the compact GET /digests endpoint (no payloads). Digest-on-pull covers records pulled AFTER Leg 3;
 * this covers the pre-existing resident set. A one-shot at boot, guarded by a cheap count so it does
 * NOT re-read the catalog once the manifest is primed.
 */

type DigestRow = { id: number; digest?: string; deleted?: boolean };
export type DigestFetch = (ids: number[]) => Promise<DigestRow[]>;
type PruneDeleted = (wooIds: number[]) => Promise<void>;

/**
 * Documents per yield in the boot primes' classification passes (#949 tranche 2, ruling R10b).
 *
 * These run on the BOOT path and read one property per resident document off an RxDocument proxy,
 * which measured 39.7 ms at 10k residents and 145.2 ms at 50k in one unbroken span — a freeze the
 * cashier meets before the till is even usable. 1,000 documents keeps each span in single-digit
 * milliseconds, matching the reconcile's dirty-scan chunk.
 */
const PRIME_SCAN_CHUNK_SIZE = 1_000;
export const PRIME_CHUNKS_PER_TICK = 5;
type PrimeChunkBudget = { remaining: number };
/**
 * Rotation for the bounded prime (codex-review P1): an id whose /digests lookup returns no
 * digest — e.g. a resident deleted server-side — stays "missing" forever. Without rotation
 * such ids permanently occupy the first budget chunks and starve every id (and space) behind
 * them. The cursor records the last ATTEMPTED wooId regardless of upsert success; the next
 * tick resumes past it, wrapping to the start, so the budget circulates the whole missing set.
 */
export type PrimeRotation = {
	afterWooId: number;
	commit: (lastAttemptedWooId: number) => Promise<void>;
};

/** Wrap-order ascending ids to start just past the rotation point. */
function rotateMissing(missing: number[], afterWooId: number): number[] {
	missing.sort((a, b) => a - b);
	if (afterWooId < 0) return missing;
	const pivot = missing.findIndex((id) => id > afterWooId);
	if (pivot <= 0) return missing;
	return [...missing.slice(pivot), ...missing.slice(0, pivot)];
}

async function primeChunks(input: {
	missing: number[];
	chunkSize: number;
	budget: PrimeChunkBudget;
	rotation?: PrimeRotation;
	attempt: (batch: number[]) => Promise<number>;
}): Promise<number> {
	const ordered = rotateMissing(input.missing, input.rotation?.afterWooId ?? -1);
	let primed = 0;
	let lastAttempted: number | null = null;
	try {
		for (const batch of chunk(ordered, input.chunkSize)) {
			if (input.budget.remaining === 0) break;
			input.budget.remaining -= 1;
			// Record the attempt BEFORE it can throw, and commit in the finally: a batch
			// that persistently rejects must rotate out of the window like any other
			// attempted batch, or it pins the cursor and starves every id behind it —
			// the exact class the rotation exists to break (coderabbit round 2).
			lastAttempted = batch[batch.length - 1]!;
			primed += await input.attempt(batch);
		}
	} finally {
		if (input.rotation && lastAttempted !== null) {
			await input.rotation.commit(lastAttempted);
		}
	}
	return primed;
}

/**
 * Pure core: given the local product/variation id sets, the manifest ids already present, and injected
 * fetch/upsert, backfill manifest rows for the MISSING ids in chunks. Returns the number of rows primed.
 */
export async function runManifestPrimePass(input: {
	productWooIds: readonly number[];
	variationWooIds: readonly number[];
	existingManifestWooIds: ReadonlySet<number>;
	fetchDigests: DigestFetch;
	upsert: (rows: ExistenceManifestDocument[]) => Promise<void>;
	pruneDeleted?: PruneDeleted;
	chunkSize?: number;
	chunkBudget?: PrimeChunkBudget;
	rotation?: PrimeRotation;
}): Promise<number> {
	// wp_posts ids never collide across products/variations, so a single lane map is unambiguous; the
	// objectType a returned id gets comes from whichever local set it belongs to.
	const laneOf = new Map<number, 'product' | 'variation'>();
	for (const id of input.productWooIds) {
		laneOf.set(id, 'product');
	}
	for (const id of input.variationWooIds) {
		if (!laneOf.has(id)) {
			laneOf.set(id, 'variation');
		}
	}

	const missing: number[] = [];
	for (const id of laneOf.keys()) {
		if (!input.existingManifestWooIds.has(id)) {
			missing.push(id);
		}
	}
	if (missing.length === 0) {
		return 0;
	}

	return primeChunks({
		missing,
		chunkSize: input.chunkSize ?? 100,
		budget: input.chunkBudget ?? { remaining: PRIME_CHUNKS_PER_TICK },
		rotation: input.rotation,
		attempt: async (batch) => {
			const batchSet = new Set(batch);
			const digests = await input.fetchDigests(batch);
			const rows: ExistenceManifestDocument[] = [];
			const deletedWooIds: number[] = [];
			for (const { id, digest, deleted } of digests) {
				const objectType = laneOf.get(id);
				if (!batchSet.has(id) || !objectType) {
					continue;
				}
				if (deleted === true) {
					deletedWooIds.push(id);
					continue;
				}
				if (typeof digest !== 'string' || digest === '') {
					continue; // an id we didn't ask about, or a record with no stored digest yet
				}
				rows.push(existenceManifestDocument({ wooId: id, objectType, digest }));
			}
			if (deletedWooIds.length > 0) {
				await input.pruneDeleted?.(deletedWooIds);
			}
			if (rows.length > 0) {
				await input.upsert(rows);
			}
			return rows.length;
		},
	});
}

type PrimeFetcher = (
	url: string,
	init?: RequestInit
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/**
 * Wiring: read the local id sets + existing manifest ids, gate on a cheap count, and run the prime pass
 * against the live GET /digests endpoint. The count-gate short-circuits the expensive full-document read
 * once every resident record has a manifest row (the steady state after the first successful prime).
 *
 * Caveat: locally-born products (no server remoteId) are excluded from the prime (not part of the
 * server's set) but still count toward `products.count()`, so their presence can keep the gate open and
 * re-read on boot. Rare for a POS (it seldom authors products); a persisted one-shot marker is the robust
 * follow-up. Correctness never depends on the gate — the pass only ever primes server ids missing locally.
 */
export async function primeExistenceManifest(
	db: ExistenceManifestPrimeDatabase,
	input: {
		fetcher: PrimeFetcher;
		syncBaseUrl: string;
		chunkSize?: number;
		chunkBudget?: PrimeChunkBudget;
		rotation?: PrimeRotation;
		pruneDeleted?: Partial<Record<'product' | 'variation', PruneDeleted>>;
	}
): Promise<number> {
	if (input.chunkBudget?.remaining === 0) return 0;
	const [manifestCount, productCount, variationCount] = await Promise.all([
		db.existenceManifest.count().exec(),
		db.products.count().exec(),
		db.variations.count().exec(),
	]);
	if (manifestCount === productCount + variationCount) {
		return 0;
	}

	const [manifestDocs, productDocs, variationDocs] = await Promise.all([
		db.existenceManifest.find().exec(),
		db.products.find().exec(),
		db.variations.find().exec(),
	]);
	// One chunked classification pass replaces the two full filter/map passes this used to make
	// over productDocs: a product is either an unpublished removal CANDIDATE or a candidate id —
	// the same partition, walked once, yielding between chunks.
	const unpublishedCandidates: string[] = [];
	const productWooIds: number[] = [];
	await forEachYielding(productDocs, PRIME_SCAN_CHUNK_SIZE, (doc) => {
		const remoteId = doc.remoteId;
		if (remoteId == null) {
			return;
		}
		const wooId = wooIdOf(remoteId);
		if (doc.payload?.status !== 'publish' && !hasPendingLocalWork(doc)) {
			unpublishedCandidates.push(doc.primary);
			return;
		}
		productWooIds.push(wooId);
	});
	// Re-validate before deleting. The classification above yields, so a cashier can start editing
	// a product AFTER it was classified as clean-and-unpublished; RxDocuments are immutable
	// snapshots, so the stale instance would never show that edit and the prime would delete
	// un-pushed work. A keyed re-read is the only way to see the current row, and the candidate
	// list is small (unpublished residents), so it costs a point-read per candidate, not a scan.
	if (unpublishedCandidates.length > 0) {
		const current = await db.products.findByIds(unpublishedCandidates).exec();
		const removable: string[] = [];
		for (const [primary, doc] of current) {
			if (doc.payload?.status !== 'publish' && !hasPendingLocalWork(doc)) {
				removable.push(primary);
				continue;
			}
			// It grew local work (or got published) while we walked — it stays resident, so it
			// belongs in the primed id set exactly as an untouched product would.
			if (doc.remoteId != null) {
				productWooIds.push(wooIdOf(doc.remoteId));
			}
		}
		if (removable.length > 0) {
			assertBulkSuccess(
				await db.products.bulkRemove(removable),
				'existence manifest prime product removal'
			);
		}
	}
	const variationWooIds: number[] = [];
	await forEachYielding(variationDocs, PRIME_SCAN_CHUNK_SIZE, (doc) => {
		if (doc.remoteId != null) {
			variationWooIds.push(wooIdOf(doc.remoteId));
		}
	});
	const residentWooIds = new Set([...productWooIds, ...variationWooIds]);
	const existingManifestWooIds = new Set<number>();
	const strandedManifestIds: string[] = [];
	await forEachYielding(manifestDocs, PRIME_SCAN_CHUNK_SIZE, (doc) => {
		existingManifestWooIds.add(doc.wooId);
		if (!residentWooIds.has(doc.wooId)) strandedManifestIds.push(String(doc.wooId));
	});
	if (strandedManifestIds.length > 0) {
		assertBulkSuccess(
			await db.existenceManifest.bulkRemove(strandedManifestIds),
			'existence manifest prime stranded removal'
		);
	}

	const fetchDigests: DigestFetch = async (ids) => {
		const url = `${input.syncBaseUrl}/digests?include=${ids.join(',')}&status=publish&absence=explicit`;
		const response = await input.fetcher(url);
		if (!response.ok) {
			throw new Error(`digests prime fetch failed: ${response.status}`);
		}
		const body = (await response.json()) as {
			digests?: DigestRow[];
		};
		return body.digests ?? [];
	};

	return runManifestPrimePass({
		productWooIds,
		variationWooIds,
		existingManifestWooIds,
		fetchDigests,
		upsert: (rows) => upsertManifestRows(db.existenceManifest, rows),
		pruneDeleted: async (wooIds) => {
			const productIds = new Set(productWooIds);
			const deletedProducts = wooIds.filter((id) => productIds.has(id));
			const deletedVariations = wooIds.filter((id) => !productIds.has(id));
			if (deletedProducts.length > 0) await input.pruneDeleted?.product?.(deletedProducts);
			if (deletedVariations.length > 0) await input.pruneDeleted?.variation?.(deletedVariations);
		},
		chunkSize: input.chunkSize,
		chunkBudget: input.chunkBudget,
		rotation: input.rotation,
	});
}

/**
 * Single-lane prime (ADR 0015): backfill manifest rows for the MISSING wooIds of ONE id-space/objectType.
 * Customers (and later orders) are a single lane over their own manifest collection, unlike the
 * products+variations two-lane pass over the shared wp_posts space. Digests are matched to the batch we
 * asked about, so a stray server id never seeds a row.
 */
export async function runSingleLanePrimePass(input: {
	wooIds: readonly number[];
	objectType: 'product' | 'variation' | 'customer' | 'order';
	existingManifestWooIds: ReadonlySet<number>;
	fetchDigests: DigestFetch;
	upsert: (rows: ExistenceManifestDocument[]) => Promise<void>;
	pruneDeleted?: PruneDeleted;
	chunkSize?: number;
	chunkBudget?: PrimeChunkBudget;
	rotation?: PrimeRotation;
}): Promise<number> {
	const missing = [...new Set(input.wooIds)].filter((id) => !input.existingManifestWooIds.has(id));
	if (missing.length === 0) {
		return 0;
	}
	return primeChunks({
		missing,
		chunkSize: input.chunkSize ?? 100,
		budget: input.chunkBudget ?? { remaining: PRIME_CHUNKS_PER_TICK },
		rotation: input.rotation,
		attempt: async (batch) => {
			const batchSet = new Set(batch);
			const digests = await input.fetchDigests(batch);
			const rows: ExistenceManifestDocument[] = [];
			const deletedWooIds: number[] = [];
			for (const { id, digest, deleted } of digests) {
				if (!batchSet.has(id)) {
					continue;
				}
				if (deleted === true) {
					deletedWooIds.push(id);
					continue;
				}
				if (typeof digest !== 'string' || digest === '') {
					continue;
				}
				rows.push(
					existenceManifestDocument({
						wooId: id,
						objectType: input.objectType,
						digest,
					})
				);
			}
			if (deletedWooIds.length > 0) {
				await input.pruneDeleted?.(deletedWooIds);
			}
			if (rows.length > 0) {
				await input.upsert(rows);
			}
			return rows.length;
		},
	});
}

/**
 * Customer boot prime (ADR 0015): backfill existenceManifestCustomers for customers resident before the
 * customer reconcile existed, so the first customer audit doesn't re-pull the whole customer base. Its OWN
 * collection + id-space (wp_users) — never touches the product manifest. Count-gated like the product prime.
 */
export async function primeExistenceManifestCustomers(
	db: ExistenceManifestPrimeDatabase,
	input: {
		fetcher: PrimeFetcher;
		syncBaseUrl: string;
		chunkSize?: number;
		chunkBudget?: PrimeChunkBudget;
		rotation?: PrimeRotation;
		pruneDeleted?: PruneDeleted;
	}
): Promise<number> {
	if (input.chunkBudget?.remaining === 0) return 0;
	const [manifestCount, customerCount] = await Promise.all([
		db.existenceManifestCustomers.count().exec(),
		db.customers.count().exec(),
	]);
	if (manifestCount === customerCount) {
		return 0;
	}

	const [manifestDocs, customerDocs] = await Promise.all([
		db.existenceManifestCustomers.find().exec(),
		db.customers.find().exec(),
	]);
	const customerWooIds: number[] = [];
	await forEachYielding(customerDocs, PRIME_SCAN_CHUNK_SIZE, (doc) => {
		if (doc.remoteId != null) {
			customerWooIds.push(wooIdOf(doc.remoteId));
		}
	});
	const residentWooIds = new Set(customerWooIds);
	const existingManifestWooIds = new Set<number>();
	const strandedManifestIds: string[] = [];
	await forEachYielding(manifestDocs, PRIME_SCAN_CHUNK_SIZE, (doc) => {
		existingManifestWooIds.add(doc.wooId);
		if (!residentWooIds.has(doc.wooId)) strandedManifestIds.push(String(doc.wooId));
	});
	if (strandedManifestIds.length > 0) {
		assertBulkSuccess(
			await db.existenceManifestCustomers.bulkRemove(strandedManifestIds),
			'customer existence manifest prime stranded removal'
		);
	}

	const fetchDigests: DigestFetch = async (ids) => {
		const response = await input.fetcher(
			`${input.syncBaseUrl}/digests?include=${ids.join(',')}&collection=customers&absence=explicit`
		);
		if (!response.ok) {
			throw new Error(`customer digests prime fetch failed: ${response.status}`);
		}
		const body = (await response.json()) as {
			digests?: DigestRow[];
		};
		return body.digests ?? [];
	};

	return runSingleLanePrimePass({
		wooIds: customerWooIds,
		objectType: 'customer',
		existingManifestWooIds,
		fetchDigests,
		upsert: (rows) => upsertManifestRows(db.existenceManifestCustomers, rows),
		pruneDeleted: input.pruneDeleted,
		chunkSize: input.chunkSize,
		chunkBudget: input.chunkBudget,
		rotation: input.rotation,
	});
}

/**
 * Order boot prime (ADR 0015): backfill existenceManifestOrders for orders resident before the order
 * reconcile existed, so the first order audit doesn't re-pull the whole order backlog. Its OWN collection
 * + id-space (HPOS/CPT order ids). Count-gated like the customer prime.
 */
export async function primeExistenceManifestOrders(
	db: ExistenceManifestPrimeDatabase,
	input: {
		fetcher: PrimeFetcher;
		syncBaseUrl: string;
		chunkSize?: number;
		chunkBudget?: PrimeChunkBudget;
		rotation?: PrimeRotation;
		pruneDeleted?: PruneDeleted;
	}
): Promise<number> {
	if (input.chunkBudget?.remaining === 0) return 0;
	const [manifestCount, orderCount] = await Promise.all([
		db.existenceManifestOrders.count().exec(),
		db.orders.count().exec(),
	]);
	if (manifestCount === orderCount) {
		return 0;
	}

	const [manifestDocs, orderDocs] = await Promise.all([
		db.existenceManifestOrders.find().exec(),
		db.orders.find().exec(),
	]);
	const orderWooIds: number[] = [];
	await forEachYielding(orderDocs, PRIME_SCAN_CHUNK_SIZE, (doc) => {
		const remoteId = (doc.toJSON() as { remoteId?: RemoteId | null }).remoteId;
		if (remoteId != null) {
			orderWooIds.push(wooIdOf(remoteId));
		}
	});
	const residentWooIds = new Set(orderWooIds);
	const existingManifestWooIds = new Set<number>();
	const strandedManifestIds: string[] = [];
	await forEachYielding(manifestDocs, PRIME_SCAN_CHUNK_SIZE, (doc) => {
		existingManifestWooIds.add(doc.wooId);
		if (!residentWooIds.has(doc.wooId)) strandedManifestIds.push(String(doc.wooId));
	});
	if (strandedManifestIds.length > 0) {
		assertBulkSuccess(
			await db.existenceManifestOrders.bulkRemove(strandedManifestIds),
			'order existence manifest prime stranded removal'
		);
	}

	const fetchDigests: DigestFetch = async (ids) => {
		const response = await input.fetcher(
			`${input.syncBaseUrl}/digests?include=${ids.join(',')}&collection=orders&absence=explicit`
		);
		if (!response.ok) {
			throw new Error(`order digests prime fetch failed: ${response.status}`);
		}
		const body = (await response.json()) as {
			digests?: DigestRow[];
		};
		return body.digests ?? [];
	};

	return runSingleLanePrimePass({
		wooIds: orderWooIds,
		objectType: 'order',
		existingManifestWooIds,
		fetchDigests,
		upsert: (rows) => upsertManifestRows(db.existenceManifestOrders, rows),
		pruneDeleted: input.pruneDeleted,
		chunkSize: input.chunkSize,
		chunkBudget: input.chunkBudget,
		rotation: input.rotation,
	});
}
