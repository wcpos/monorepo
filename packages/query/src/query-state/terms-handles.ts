/**
 * The taxonomy reads as query handles (roadmap#423): every resident term of one product
 * taxonomy (the category tree, the browse tiles, the settings dialog's counts), and the local
 * products carrying a set of zero-count terms (which of them the browse stage keeps).
 */

import * as React from 'react';

import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import { engineCollectionNameFor } from '../engine-adapter/collection-map';
import { type EngineQueryDescriptor } from '../engine-query';
import { type QueryHandle } from '../query-handle';
import { type QueryResult } from '../query-result';
import { useQueryRuntime } from '../provider';
import {
	acquireEmptyQueryHandle,
	acquireEngineQueryHandle,
	canonicalQueryKey,
	useQueryHandleFields,
} from './query-handles';
import { compileQuery } from './query-state-translator';
import { useCoverageGeneration, useScopeKey } from './scope-key';

import type { RxCollection } from 'rxdb';

type TermsCollection = 'products/categories' | 'products/tags' | 'products/brands';

function termsDescriptor(collection: TermsCollection): EngineQueryDescriptor {
	return { collection, selector: {}, sort: [{ name: 'asc' }] };
}

/**
 * Whether a (non-empty) result's rows were read from the database the engine has active now: a
 * read's replayed answer can be the previous scope's for the moment between a scope switch and
 * the new database's first answer. With no active database to compare (or a row that does not
 * say where it came from), it is taken as read.
 */
function readFromActiveScope(engine: RxdbSyncEngine, result: QueryResult<RxCollection>): boolean {
	const active = engine.active()?.database;
	const source = result.hits[0]?.record.collection?.database;
	return !active || !source || source === active;
}

function acquireTermsHandle(
	engine: RxdbSyncEngine,
	key: string,
	collection: TermsCollection,
	demand: boolean
): QueryHandle<QueryResult<RxCollection>> {
	return acquireEngineQueryHandle(engine, key, (id) => {
		const compiled = compileQuery(
			collection,
			{ search: '', filters: {}, sort: { field: 'name', direction: 'asc' } },
			{ id }
		);
		return {
			descriptor: termsDescriptor(collection),
			compiled: demand ? compiled : { ...compiled, demand: [] },
		};
	});
}

export type AllTerms = {
	/** The taxonomy's read: every resident term, answered as the engine holds them. */
	handle: QueryHandle<QueryResult<RxCollection>>;
	/**
	 * The handle's current answer is not one yet: a residents-only read of an empty collection
	 * before its one refresh has settled, or rows that are not the active scope's. The reader
	 * treats it as unanswered.
	 */
	withheld: boolean;
};

/**
 * Full reference-lane residents of one product taxonomy: the category tree, the browse tiles.
 * `residentsOnly` reads what the till holds and declares no refresh — for a surface that only
 * summarises (the settings dialog's counts), so opening it pulls nothing; the reference seed
 * lane and the stage's own handle keep the residents current.
 *
 * Except an empty collection: a fresh till holds no terms until the reference lane lands, and
 * no residents is not an answer then. While it has none, a residents-only read declares ONE
 * refresh, and the hook reports its empty answer `withheld` until that refresh has settled —
 * met, released or failed — so a still-loading source reads unanswered, never empty. The
 * refresh, once declared, stands until it settles (releasing it mid-pull would abort it) and is
 * then dropped; an empty answer after that is the collection's own. Residents present: no
 * demand. The one-shot is the ENGINE's, the collection's and the SCOPE's: a cross-site change
 * (a new engine from `QueryProvider`) and a same-site store or cashier switch (the same engine,
 * `scope.switch()`, which bumps every collection's coverage generation — as a collection reset
 * does) both start over, so the new scope's empty collection is pulled too.
 *
 * The withhold is the reader's verdict, not a filter on the read: the handle stays a plain read
 * of the terms, so the read before the pull and the read after it are ONE handle (one engine
 * read while the dialog is open), and only the pull — the read with a demand, held beside it
 * while it runs — is another.
 */
export function useAllTermsHandle(
	collection: TermsCollection,
	enabled = true,
	{ residentsOnly = false }: { residentsOnly?: boolean } = {}
): AllTerms {
	const { engine } = useQueryRuntime();
	// The scope the engine reads now: a same-site switch keeps the engine and changes its
	// database in place, and bumps this generation (so does a reset of the collection).
	const generation = useCoverageGeneration(engine, engineCollectionNameFor(collection));
	const scope = useScopeKey(collection);
	// The empty-collection refresh: 'idle' until an empty answer, 'pull' while declared, then
	// 'done' — for the engine, collection and generation it was recorded under; any other
	// reads 'idle'.
	const [refreshFor, setRefreshFor] = React.useState<{
		engine: RxdbSyncEngine;
		collection: string;
		generation: number;
		phase: 'idle' | 'pull' | 'done';
	}>({ engine, collection, generation, phase: 'idle' });
	const refresh =
		refreshFor.engine === engine &&
		refreshFor.collection === collection &&
		refreshFor.generation === generation
			? refreshFor.phase
			: 'idle';
	const pulling = residentsOnly && refresh === 'pull';
	// The key is what changes the READ: a residents-only read declares nothing except while it
	// pulls. The scope is in it, so a switch is a new handle — unanswered until the new scope's
	// read answers, never holding the previous scope's terms.
	const keyFor = (demand: boolean) =>
		canonicalQueryKey(['terms', collection, scope, demand ? 'demand' : 'residents']);
	const restingKey = enabled && residentsOnly ? keyFor(false) : null;
	// The residents-only read without a demand: before the pull and after it, ONE handle. It is
	// held through the pull as well, so the read after the pull is the read before it and the
	// answer is there the moment the pull settles.
	const resting = React.useMemo(
		() => (restingKey === null ? null : acquireTermsHandle(engine, restingKey, collection, false)),
		[collection, engine, restingKey]
	);
	const key = !enabled
		? canonicalQueryKey(['terms', collection, 'disabled'])
		: keyFor(!residentsOnly || pulling);
	const handle = React.useMemo(() => {
		if (!enabled) return acquireEmptyQueryHandle(engine, key);
		// The same object, not a second acquire of its key: two acquires before the first is
		// retained would build two handles.
		if (resting && key === resting.key) return resting;
		return acquireTermsHandle(engine, key, collection, true);
	}, [collection, enabled, engine, key, resting]);
	React.useEffect(() => resting?.retain(), [resting]);
	React.useEffect(() => handle.retain(), [handle]);

	const snapshot = useQueryHandleFields(handle, []);
	// An empty resident answer starts the one refresh (state set while rendering — React's
	// "previous render" pattern; the next render reads 'pull' and sets nothing).
	if (
		residentsOnly &&
		enabled &&
		refresh === 'idle' &&
		snapshot.ready &&
		snapshot.hits.length === 0
	)
		setRefreshFor({ engine, collection, generation, phase: 'pull' });

	// Runs after the retain above, so the barrier it waits on is the refresh this commit declared.
	React.useEffect(() => {
		if (!pulling || !enabled) return undefined;
		let live = true;
		void handle.whenReady().then(() => {
			if (live) setRefreshFor({ engine, collection, generation, phase: 'done' });
		});
		return () => {
			live = false;
		};
	}, [collection, enabled, engine, generation, handle, pulling]);

	// A disabled read's empty answer is its answer (it is never pending). Otherwise, until the
	// refresh is done, only a non-empty answer read from the ACTIVE scope is one: the engine
	// swaps the database first and bumps the generation a microtask later, so a read can still
	// hand this scope's handle the previous scope's terms.
	const withheld =
		residentsOnly &&
		enabled &&
		refresh !== 'done' &&
		(snapshot.hits.length === 0 || !readFromActiveScope(engine, snapshot.result));
	return React.useMemo(() => ({ handle, withheld }), [handle, withheld]);
}

export function useAllCategoriesHandle(): QueryHandle<QueryResult<RxCollection>> {
	return useAllTermsHandle('products/categories').handle;
}

/**
 * How often the existence read may re-check after a product write. Which zero-count terms a
 * POS-only product keeps on the stage changes when the catalogue does, not per sale — and
 * every sale writes stock, so a live read would re-run per sale. Half a minute keeps a newly
 * synced product's term appearing promptly without paying for the read on every write.
 */
export const EXISTENCE_RECHECK_MS = 30_000;

/**
 * The local products carrying any of `termIds` in one taxonomy — the same taxonomy filter a
 * category/tag/brand pill applies (categories, tags and brands are promoted id columns). Local
 * only, no remote pull: whether a zero-count term has products is decided by what the till has
 * synced, since the catalogue recount is the storefront's. An empty id list would compile to no
 * filter (every product), so the read is disabled then: the empty handle, answered empty.
 *
 * Not live: answered once, then re-checked at most every `EXISTENCE_RECHECK_MS` after a write.
 * The engine has no field projection, so the answer is still the matching records.
 */
export function useProductsCarryingTermsHandle(
	taxonomy: 'categories' | 'tags' | 'brands',
	termIds: readonly number[],
	{ showOutOfStock = false }: { showOutOfStock?: boolean } = {}
): QueryHandle<QueryResult<RxCollection>> {
	const { engine } = useQueryRuntime();
	const scope = useScopeKey('products');
	const idsKey = [...new Set(termIds)].sort((a, b) => a - b).join(',');
	const key =
		idsKey === ''
			? canonicalQueryKey(['carrying', 'disabled'])
			: canonicalQueryKey(['carrying', taxonomy, scope, idsKey, showOutOfStock]);
	const handle = React.useMemo(() => {
		if (idsKey === '') return acquireEmptyQueryHandle(engine, key);
		const ids = idsKey.split(',').map(Number);
		return acquireEngineQueryHandle(engine, key, (id) => {
			const query = compileQuery(
				'products',
				{
					search: '',
					// The selling surface's baseline, so a lifted term opens onto something: published
					// only (a cached draft must not keep its zero-count term on the stage), and in stock
					// unless the merchant shows out-of-stock products. Catalogue visibility is not
					// filtered — a published product hidden from the catalogue is what this read is for.
					filters: {
						categories: [],
						tags: [],
						brands: [],
						status: 'publish',
						...(showOutOfStock ? {} : { stock_status: 'instock' }),
						[taxonomy]: ids,
					},
					sort: { field: 'name', direction: 'asc' },
				},
				{ id }
			);
			return {
				compiled: { ...query, demand: [] },
				descriptor: { collection: query.collection, read: query.read },
				recheckMs: EXISTENCE_RECHECK_MS,
			};
		});
	}, [engine, idsKey, key, showOutOfStock, taxonomy]);
	React.useEffect(() => handle.retain(), [handle]);
	return handle;
}
