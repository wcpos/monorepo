/**
 * The generated apply arms (ADR 0018): ALL of
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

import { assertBulkSuccess, mintRemoteId, remoteIdOrNull, wooIdOf } from '@wcpos/sync-core';
import type {
	Fetcher,
	HybridCollection,
	RebaselineTargetedResult,
	ReferenceCollection,
	RemoteId,
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
import {
	removeManifestByWooIds,
	upsertManifestRows,
} from '../local-coverage/rx-existence-manifest-repository';
import { hasPendingLocalWork, withoutLocallyProtected } from '../write-path/local-work-guard';

import type { BarcodeSelectorsReader } from '../materialization/barcode-selectors';
import type { RxCollection, RxDatabase } from 'rxdb';
import type { SyncCollectionName } from '../collections/engine-collections';

// Re-exported for the require plane: the demand plane's direct
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
	withCollectionActivity?: <T>(
		collection: SyncCollectionName,
		work: () => Promise<T>
	) => Promise<T>;
	/**
	 * LIVE read of the barcode carriers of the SCOPE this tick is bound to — the
	 * projections derive `payload.barcode` from them (ADR 0006). A reader, not a
	 * value: an arm pulls in chunks, and the carrier can move between them.
	 * Absent (or answering undefined) = none known for this scope, so no barcode
	 * is materialized.
	 */
	barcodeSelectors?: BarcodeSelectorsReader;
};

const INCLUDE_CHUNK = 50;
const REFRESH_PAGE_SIZE = 100;
type PruneByIds = (ids: number[]) => Promise<number>;

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
		const errorBody = (await response.json().catch(() => null)) as {
			code?: unknown;
			message?: unknown;
		} | null;
		const serverDetail = [errorBody?.code, errorBody?.message]
			.filter((value): value is string => typeof value === 'string')
			.join(': ');
		throw new Error(
			`${path} pull failed: HTTP ${response.status}${serverDetail ? ` — ${serverDetail}` : ''}`
		);
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
 * parser), project, bulkUpsert. A SHORT response means the server deliberately
 * omitted or no longer has the absent requested ids, so every targeted
 * collection prunes those local residents. A caller can provide a custom prune
 * implementation when deletion also needs to update companion state, such as
 * the existence manifest. Transport and parse errors still throw before the
 * prune can run.
 */
async function pullByIds(
	ctx: HandlerContext,
	d: TargetedDescriptor,
	ids: number[],
	persist?: (documents: Record<string, unknown>[]) => Promise<void>,
	pruneByIds?: PruneByIds
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
				...(d.collection === 'products' ? { status: 'publish' } : {}),
			})
		);
		let pruned = 0;
		if (payloads.length < chunk.length) {
			const present = new Set(payloads.map((payload) => Number((payload as { id?: unknown }).id)));
			const absent = chunk.filter((id) => !present.has(id));
			pruned = pruneByIds
				? await pruneByIds(absent)
				: await removeByWooIds(ctx, d.collection, d.wooIdField, absent);
			if (pruned > 0) {
				ctx.observe?.({
					type: 'targeted.pull.shortfall-prune',
					level: 'warn',
					collection: d.collection,
					fields: {
						requested: chunk.length,
						received: payloads.length,
						missing: absent.length,
					},
				});
			}
		}
		const documents = payloads.map((payload) => d.project(payload, ctx.barcodeSelectors?.()));
		const applicable = await withoutLocallyProtected(
			collection as never,
			documents as { uuid: string }[]
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
		applied += documents.length + pruned;
	}
	return applied;
}

/** Tombstone by numeric Woo id: resolve storage rows via the descriptor's id field. */
async function removeByWooIds(
	ctx: HandlerContext,
	name: string,
	wooIdField: 'remoteId',
	ids: number[]
): Promise<number> {
	if (ids.length === 0) return 0;
	const collection = collectionOf(ctx, name);
	const remoteIds = ids.map((id) => mintRemoteId(id, `${name} tombstone id`));
	const docs = await collection
		.find({ selector: { [wooIdField]: { $in: remoteIds } } as never })
		.exec();
	const protectedRemoteIds = new Set<RemoteId>();
	const removable: string[] = [];
	for (const doc of docs) {
		const row = doc.toJSON() as Record<string, unknown>;
		if (!hasPendingLocalWork(row)) {
			removable.push((doc as { primary: string }).primary);
			continue;
		}
		const remoteId = remoteIdOrNull(row[wooIdField]);
		if (remoteId !== null) protectedRemoteIds.add(remoteId);
	}
	if (removable.length > 0) {
		assertBulkSuccess(await collection.bulkRemove(removable), 'change-signal-handlers remove');
	}
	const manifestName =
		name === 'products' || name === 'variations'
			? 'existenceManifest'
			: name === 'customers'
				? 'existenceManifestCustomers'
				: name === 'orders'
					? 'existenceManifestOrders'
					: null;
	const manifest = manifestName ? ctx.database.collections[manifestName] : undefined;
	if (manifest) {
		await removeManifestByWooIds(
			manifest as never,
			remoteIds.filter((remoteId) => !protectedRemoteIds.has(remoteId)).map(wooIdOf)
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
	const documents = (await fetchAll(ctx, d.refreshPath)).map((payload) =>
		d.project(payload, ctx.barcodeSelectors?.())
	);
	const applicable = await withoutLocallyProtected(
		collection as never,
		documents as { uuid: string }[]
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
	const documents = (await fetchAll(ctx, d.refreshPath)).map((payload) =>
		d.project(payload, ctx.barcodeSelectors?.())
	);
	const applicable = await withoutLocallyProtected(
		collection as never,
		documents as { uuid: string }[]
	);
	if (applicable.length > 0) {
		assertBulkSuccess(
			await collection.bulkUpsert(applicable as never[]),
			'change-signal-handlers upsert'
		);
	}
	// Prune by the fetched KEEP-SET of storage ids (uuid keys) — id-space
	// discipline per the terms flip: storage ids only, never Woo ids.
	const kept = new Set(documents.map((doc) => (doc as { uuid: string }).uuid));
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
				deleteTaxRates = (ids) => removeByWooIds(ctx, descriptor.collection, 'remoteId', ids);
				break;
			}
			case 'greedy-prunable': {
				referenceRefreshers.set(descriptor.hybrid, async () => {
					if ((await collectionOf(ctx, descriptor.collection).count().exec()) > 0)
						await refreshPrunable(ctx, descriptor);
				});
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

/** Read synced docs for the descriptor-backed targeted collections. */
async function loadSyncedTargetedDocs(
	ctx: HandlerContext,
	collection: HybridCollection
): Promise<SyncedDocument[]> {
	const descriptor = COLLECTION_DESCRIPTORS.find(
		(candidate): candidate is TargetedDescriptor =>
			candidate.shape === 'targeted' && candidate.hybrid === collection
	);
	if (!descriptor) return [];
	const docs = await collectionOf(ctx, descriptor.collection).find().exec();
	return docs.map((doc) => {
		const json = doc.toJSON() as {
			uuid: string;
			payload: Record<string, unknown>;
		};
		return { id: json.uuid, payload: json.payload };
	});
}

/**
 * Rebaseline one targeted collection: re-pull every locally synced record's
 * current server state, tolerating server-side deletions by pruning them — a
 * record that vanishes from an include pull was deleted during the skipped
 * window, so it routes through the same tombstone path the delete arm uses
 * (pending local work stays protected there). Docs with pending local work are
 * excluded from the pull outright: the local-work guard would discard their
 * payloads anyway, so fetching them is pure waste during an operation whose
 * point is bounding sync cost. Ids come from the MIRRORED woo-id field first
 * (the write-ack path records the assigned server id there while the original
 * create payload carries no `id`), falling back to `payload.id`.
 */
async function rebaselineTargeted(
	ctx: HandlerContext,
	collection: 'products' | 'variations' | 'customers'
): Promise<RebaselineTargetedResult> {
	const descriptor = COLLECTION_DESCRIPTORS.find(
		(candidate): candidate is TargetedDescriptor =>
			candidate.shape === 'targeted' && candidate.hybrid === collection
	);
	if (!descriptor) return { requested: 0, applied: 0, pruned: 0 };
	const docs = await collectionOf(ctx, descriptor.collection).find().exec();
	const wooIds = new Set<number>();
	for (const doc of docs) {
		const json = doc.toJSON() as Record<string, unknown> & {
			payload?: Record<string, unknown>;
		};
		if (hasPendingLocalWork(json)) continue;
		const remoteId = remoteIdOrNull(json[descriptor.wooIdField] ?? json.payload?.id);
		if (remoteId !== null) wooIds.add(wooIdOf(remoteId));
	}
	const requested = [...wooIds].sort((left, right) => left - right);
	const missingIds: number[] = [];
	const applied = await pullByIds(ctx, descriptor, requested, undefined, async (ids) => {
		missingIds.push(...ids);
		return 0;
	});
	const pruned =
		missingIds.length > 0
			? await removeByWooIds(ctx, descriptor.collection, descriptor.wooIdField, missingIds)
			: 0;
	return { requested: requested.length, applied, pruned };
}

/**
 * Compile-time lock #2: this literal is typed against the fully-REQUIRED
 * `ReplicationActionHandlers` — a 14th arm added in sync-core is a compile
 * error on this package, not on any host.
 */
export function buildReplicationHandlers(ctx: HandlerContext): ReplicationActionHandlers {
	const effects = collectShapeEffects(ctx);
	const active = <T>(collection: SyncCollectionName, work: () => Promise<T>): Promise<T> =>
		ctx.withCollectionActivity?.(collection, work) ?? work();
	const handlers: ReplicationActionHandlers = {
		pullProducts: (ids) => active('products', () => effects.targeted.products.pull(ids)),
		deleteProducts: (ids) => effects.targeted.products.remove(ids),
		pullVariations: (ids) => active('variations', () => effects.targeted.variations.pull(ids)),
		deleteVariations: (ids) => effects.targeted.variations.remove(ids),
		pullCustomers: (ids) => active('customers', () => effects.targeted.customers.pull(ids)),
		deleteCustomers: (ids) => effects.targeted.customers.remove(ids),
		refreshTaxRates: () => active('taxRates', () => effects.refreshTaxRates()),
		deleteTaxRates: (ids) => effects.deleteTaxRates(ids),
		refreshReferenceCollection: (collection) =>
			active(collection, () => effects.refreshReference(collection)),
		rebaselineTargeted: (collection) =>
			active(collection, () => rebaselineTargeted(ctx, collection)),
		loadSyncedDocs: (collection) => loadSyncedTargetedDocs(ctx, collection),
		// The engine package carries no scan-index store (the web host's stance
		// too): log and report applied so the config baseline can advance with
		// the (vacuous) index it represents.
		applyBarcodeIndex: (collection, index) => {
			ctx.log(
				`barcode index for ${collection}: ${index.index.size} entries (no scan-index store in the engine — logged only)`
			);
			return true;
		},
		// Resolves each resident's Woo id through the descriptor's mirrored field
		// with a payload.id fallback, and skips docs with pending local work —
		// the same resolution rebaselineTargeted uses. A locally created record
		// carries its assigned id only in the mirror until the next server read,
		// and a payload.id-only mapping would drop it from the re-fetch.
		reFetchCollection: async (collection) => {
			if (collection !== 'products' && collection !== 'variations') return 0;
			return active(collection, async () => {
				const descriptor = COLLECTION_DESCRIPTORS.find(
					(candidate): candidate is TargetedDescriptor =>
						candidate.shape === 'targeted' && candidate.hybrid === collection
				);
				if (!descriptor) return 0;
				const docs = await collectionOf(ctx, descriptor.collection).find().exec();
				const wooIds = new Set<number>();
				for (const doc of docs) {
					const json = doc.toJSON() as Record<string, unknown> & {
						payload?: Record<string, unknown>;
					};
					if (hasPendingLocalWork(json)) continue;
					const remoteId = remoteIdOrNull(json[descriptor.wooIdField] ?? json.payload?.id);
					if (remoteId !== null) wooIds.add(wooIdOf(remoteId));
				}
				return effects.targeted[collection].pull([...wooIds].sort((left, right) => left - right));
			});
		},
		persistState: (state) => ctx.persistState(state),
		log: ctx.log,
		...(ctx.observe ? { observe: ctx.observe } : {}),
	};
	return handlers;
}
