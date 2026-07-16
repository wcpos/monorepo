/**
 * The generated apply arms (facade slice 3, ADR 0018): ALL of
 * `ReplicationActionHandlers` is built HERE, once, from the package-private
 * collection descriptors — ADR 0007's completeness guarantee moves from
 * "every host compiles 13 arms" to "this package compiles them once", held by
 * two compile-time locks pointing in opposite directions:
 *
 *  1. shape → arms: `collectShapeEffects` switches on `descriptor.shape` with
 *     a `never` guard — adding a shape variant without a generator arm fails
 *     the build here;
 *  2. arms → shape: `buildReplicationHandlers` returns an object literal typed
 *     against the fully-REQUIRED `ReplicationActionHandlers` — a new arm added
 *     in sync-core fails the build here until the descriptors produce it.
 *
 * Slice-3 arm effects are DIRECT chunked fetch-and-upsert through the
 * scope-bound fetcher (the web host's scheduler/coverage indirection is the
 * slice-4 fetch queue; these bodies are package-internal and swap then).
 */

import { assertBulkSuccess } from '@wcpos/sync-core';
import type {
	Fetcher,
	HybridCollection,
	ReferenceCollection,
	ReplicationActionHandlers,
	ReplicationActions,
	SyncedDocument,
	SyncObserver,
} from '@wcpos/sync-core';

import {
	COLLECTION_DESCRIPTORS,
	type GreedyPrunableDescriptor,
	type TargetedDescriptor,
	type UpsertRefreshDescriptor,
} from '../collections/collection-descriptors';
import { manifestRowOf } from '../materialization/record-materialization';
import { upsertManifestRows } from '../local-coverage/rx-existence-manifest-repository';
import { hasPendingLocalWork, withoutLocallyProtected } from '../write-path/local-work-guard';

import type { RxCollection, RxDatabase } from 'rxdb';

// Re-exported for the require plane (slice 4): the demand plane's direct
// pulls are exactly the change-signal arm effects — one implementation.
export { pullByIds as pullTargetedByIds };
export async function refreshCollection(
	ctx: HandlerContext,
	descriptor: GreedyPrunableDescriptor | UpsertRefreshDescriptor
): Promise<void> {
	if (descriptor.shape === 'upsert-refresh') {
		await refreshUpsert(ctx, descriptor);
		return;
	}
	await refreshPrunable(ctx, descriptor);
}

/** Everything one tick's generated arms need — captured per tick, scope-bound. */
export type HandlerContext = {
	/** The ACTIVE scope's database (the lane resolves it inside the guarded tick). */
	database: RxDatabase;
	/** Scope-bound RAW fetcher (bound.bindFetch(ports.fetcher)) — never pre-scoped here. */
	fetch: Fetcher;
	syncBaseUrl: string;
	persistState: (state: ReplicationActions['nextState']) => Promise<void>;
	log: (line: string) => void;
	observe?: SyncObserver;
	pullBatchSize?: () => number | undefined;
};

const INCLUDE_CHUNK = 50;
const REFRESH_PAGE_SIZE = 100;

function collectionOf(ctx: HandlerContext, name: string): RxCollection {
	const collection = ctx.database.collections[name];
	if (!collection) {
		throw new Error(`Engine scope database is missing collection "${name}"`);
	}
	return collection;
}

async function fetchBody(
	ctx: HandlerContext,
	path: string,
	params: Record<string, string>
): Promise<unknown> {
	const search = new URLSearchParams(params).toString();
	const url = `${ctx.syncBaseUrl}${path}${search === '' ? '' : `?${search}`}`;
	const response = await ctx.fetch(url);
	if (!response.ok) {
		throw new Error(`${path} pull failed: HTTP ${response.status}`);
	}
	return (await response.json()) as unknown;
}

async function fetchPayloadPage(
	ctx: HandlerContext,
	path: string,
	params: Record<string, string>
): Promise<Record<string, unknown>[]> {
	const body = await fetchBody(ctx, path, params);
	if (!Array.isArray(body)) {
		throw new Error(`${path} pull returned a non-array body`);
	}
	return body as Record<string, unknown>[];
}

/**
 * Targeted pull: include-chunked fetch (through the descriptor's envelope
 * parser), project, bulkUpsert. A SHORT response THROWS — the same assertion
 * the web scheduler fetchers make: a hidden/missing record or a bad partial
 * page must fail the tick (cursor stays put, commit-only-after-all-arms) so
 * the next poll re-detects it; silently lowering the applied count would let
 * the cursor advance past a record that was never applied. The self-healing
 * delete case is covered upstream: a record deleted between signal and pull
 * re-polls as a DELETE row, and the router makes delete win over pull.
 */
async function pullByIds(
	ctx: HandlerContext,
	d: TargetedDescriptor,
	ids: number[],
	persist?: (documents: Record<string, unknown>[]) => Promise<void>
): Promise<number> {
	if (ids.length === 0) return 0;
	const collection = collectionOf(ctx, d.collection);
	const includeChunk = ctx.pullBatchSize?.() ?? INCLUDE_CHUNK;
	let applied = 0;
	for (let at = 0; at < ids.length; at += includeChunk) {
		const chunk = ids.slice(at, at + includeChunk);
		const payloads = d.parse(
			await fetchBody(ctx, d.pullPath, {
				include: chunk.join(','),
				per_page: String(chunk.length),
			})
		);
		if (payloads.length < chunk.length) {
			throw new Error(
				`${d.pullPath} include pull returned ${payloads.length}/${chunk.length} records — failing the tick so the cursor cannot advance past an unapplied record`
			);
		}
		const documents = payloads.map((payload) => d.project(payload));
		const applicable = await withoutLocallyProtected(
			collection as never,
			documents as { id: string }[]
		);
		if (persist) await persist(applicable);
		else {
			if (applicable.length > 0)
				assertBulkSuccess(
					await collection.bulkUpsert(applicable as never[]),
					'change-signal-handlers upsert'
				);
			const rows = applicable.flatMap((document) =>
				manifestRowOf(document) ? [manifestRowOf(document)!] : []
			);
			if (rows.length > 0) {
				const manifestName =
					d.collection === 'customers' ? 'existenceManifestCustomers' : 'existenceManifest';
				await upsertManifestRows(ctx.database.collections[manifestName] as never, rows);
			}
		}
		applied += documents.length;
	}
	return applied;
}

/** Tombstone by numeric Woo id: resolve storage rows via the descriptor's id field. */
async function removeByWooIds(
	ctx: HandlerContext,
	name: string,
	wooIdField: string,
	ids: number[]
): Promise<number> {
	if (ids.length === 0) return 0;
	const collection = collectionOf(ctx, name);
	const docs = await collection.find({ selector: { [wooIdField]: { $in: ids } } as never }).exec();
	const removable = docs.filter((doc) => !hasPendingLocalWork(doc.toJSON()));
	if (removable.length > 0) {
		assertBulkSuccess(
			await collection.bulkRemove(removable.map((doc) => (doc as { primary: string }).primary)),
			'change-signal-handlers remove'
		);
	}
	// A delete for a never-synced id is vacuously applied — tombstone semantics,
	// not a shortfall (mirrors the web lanes).
	return ids.length;
}

/** Full-page refresh: pages until a short page; returns every projected document. */
async function fetchAll(ctx: HandlerContext, path: string): Promise<Record<string, unknown>[]> {
	const all: Record<string, unknown>[] = [];
	const pageSize = ctx.pullBatchSize?.() ?? REFRESH_PAGE_SIZE;
	for (let page = 1; ; page += 1) {
		const payloads = await fetchPayloadPage(ctx, path, {
			per_page: String(pageSize),
			page: String(page),
		});
		all.push(...payloads);
		if (payloads.length < pageSize) return all;
	}
}

/** upsert-refresh: full re-pull upserts, NEVER prunes (deletes have their own arm). */
async function refreshUpsert(ctx: HandlerContext, d: UpsertRefreshDescriptor): Promise<void> {
	const collection = collectionOf(ctx, d.collection);
	const documents = (await fetchAll(ctx, d.refreshPath)).map((payload) => d.project(payload));
	const applicable = await withoutLocallyProtected(
		collection as never,
		documents as { id: string }[]
	);
	if (applicable.length > 0) {
		assertBulkSuccess(
			await collection.bulkUpsert(applicable as never[]),
			'change-signal-handlers upsert'
		);
	}
}

/** greedy-prunable: full re-pull upserts AND set-difference-prunes by KEPT storage ids. */
async function refreshPrunable(ctx: HandlerContext, d: GreedyPrunableDescriptor): Promise<void> {
	const collection = collectionOf(ctx, d.collection);
	const documents = (await fetchAll(ctx, d.refreshPath)).map((payload) => d.project(payload));
	const applicable = await withoutLocallyProtected(
		collection as never,
		documents as { id: string }[]
	);
	if (applicable.length > 0) {
		assertBulkSuccess(
			await collection.bulkUpsert(applicable as never[]),
			'change-signal-handlers upsert'
		);
	}
	// Prune by the fetched KEEP-SET of storage ids (uuid keys) — id-space
	// discipline per the terms flip: storage ids only, never Woo ids.
	const kept = new Set(documents.map((doc) => String((doc as { id: string }).id)));
	const existing = await collection.find().exec();
	const doomed = existing
		.filter((doc) => !hasPendingLocalWork(doc.toJSON()))
		.map((doc) => (doc as { primary: string }).primary)
		.filter((id) => !kept.has(id));
	if (doomed.length > 0) {
		assertBulkSuccess(await collection.bulkRemove(doomed), 'change-signal-handlers remove');
	}
}

type TargetedEffects = {
	pull: (ids: number[]) => Promise<number>;
	remove: (ids: number[]) => Promise<number>;
};

type ShapeEffects = {
	targeted: Record<TargetedDescriptor['collection'], TargetedEffects>;
	refreshTaxRates: () => Promise<void>;
	deleteTaxRates: (ids: number[]) => Promise<number>;
	refreshReference: (collection: ReferenceCollection) => Promise<void>;
};

/** Compile-time lock #1: the shape union is exhausted HERE. */
function collectShapeEffects(ctx: HandlerContext): ShapeEffects {
	const targeted = {} as ShapeEffects['targeted'];
	let refreshTaxRates: ShapeEffects['refreshTaxRates'] | null = null;
	let deleteTaxRates: ShapeEffects['deleteTaxRates'] | null = null;
	const referenceRefreshers = new Map<ReferenceCollection, () => Promise<void>>();

	for (const descriptor of COLLECTION_DESCRIPTORS) {
		switch (descriptor.shape) {
			case 'targeted': {
				targeted[descriptor.collection] = {
					pull: (ids) => pullByIds(ctx, descriptor, ids),
					remove: (ids) => removeByWooIds(ctx, descriptor.collection, descriptor.wooIdField, ids),
				};
				break;
			}
			case 'upsert-refresh': {
				refreshTaxRates = () => refreshUpsert(ctx, descriptor);
				deleteTaxRates = (ids) => removeByWooIds(ctx, descriptor.collection, 'wooTaxRateId', ids);
				break;
			}
			case 'greedy-prunable': {
				referenceRefreshers.set(descriptor.hybrid, () => refreshPrunable(ctx, descriptor));
				break;
			}
			case 'local-only':
				break;
			default: {
				// Adding a shape to the union without a generator arm fails the build
				// here — the scrutinee is no longer `never` (the ticket's completeness
				// requirement, ADR 0018).
				const _exhaustive: never = descriptor;
				throw new Error(`Unhandled collection shape: ${JSON.stringify(_exhaustive)}`);
			}
		}
	}

	if (!refreshTaxRates || !deleteTaxRates) {
		throw new Error('Descriptor table is missing the upsert-refresh (taxRates) row');
	}
	const refreshReference = async (collection: ReferenceCollection): Promise<void> => {
		const refresh = referenceRefreshers.get(collection);
		if (!refresh) {
			throw new Error(`No greedy-prunable descriptor for reference collection "${collection}"`);
		}
		await refresh();
	};
	return { targeted, refreshTaxRates, deleteTaxRates, refreshReference };
}

/** Products are the barcode/config-tier collection — same as the web tick. */
async function loadSyncedProducts(
	ctx: HandlerContext,
	collection: HybridCollection
): Promise<SyncedDocument[]> {
	if (collection !== 'products') return [];
	const docs = await collectionOf(ctx, 'products').find().exec();
	return docs.map((doc) => {
		const json = doc.toJSON() as { id: string; payload: Record<string, unknown> };
		return { id: json.id, payload: json.payload };
	});
}

/**
 * Compile-time lock #2: this literal is typed against the fully-REQUIRED
 * `ReplicationActionHandlers` — a 14th arm added in sync-core is a compile
 * error on this package, not on any host.
 */
export function buildReplicationHandlers(ctx: HandlerContext): ReplicationActionHandlers {
	const effects = collectShapeEffects(ctx);
	const handlers: ReplicationActionHandlers = {
		pullProducts: (ids) => effects.targeted.products.pull(ids),
		deleteProducts: (ids) => effects.targeted.products.remove(ids),
		pullVariations: (ids) => effects.targeted.variations.pull(ids),
		deleteVariations: (ids) => effects.targeted.variations.remove(ids),
		pullCustomers: (ids) => effects.targeted.customers.pull(ids),
		deleteCustomers: (ids) => effects.targeted.customers.remove(ids),
		refreshTaxRates: () => effects.refreshTaxRates(),
		deleteTaxRates: (ids) => effects.deleteTaxRates(ids),
		refreshReferenceCollection: (collection) => effects.refreshReference(collection),
		loadSyncedDocs: (collection) => loadSyncedProducts(ctx, collection),
		// The engine package carries no scan-index store (the web host's stance
		// too): log and report applied so the config baseline can advance with
		// the (vacuous) index it represents.
		applyBarcodeIndex: (collection, index) => {
			ctx.log(
				`barcode index for ${collection}: ${index.index.size} entries (no scan-index store in the engine — logged only)`
			);
			return true;
		},
		reFetchCollection: async (collection) => {
			if (collection !== 'products') return 0;
			const synced = await loadSyncedProducts(ctx, 'products');
			const wooIds = synced
				.map((doc) => Number((doc.payload as { id?: unknown }).id))
				.filter((id) => Number.isSafeInteger(id) && id > 0);
			return effects.targeted.products.pull(wooIds);
		},
		persistState: (state) => ctx.persistState(state),
		log: ctx.log,
		...(ctx.observe ? { observe: ctx.observe } : {}),
	};
	return handlers;
}
