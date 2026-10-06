import { asyncScheduler, ReplaySubject, throttleTime } from 'rxjs';

import { searchRowText } from './search-fields';
import { SEARCH_SCAN_RETHROTTLE_MS, type SearchableCollection } from './search-shared';
import { searchProjection } from './engine-adapter/search-snapshot';

import type { EngineDocument, LegacyCollectionName } from './engine-adapter/collection-map';
import type { EngineRxDocument } from './engine-adapter/execute-query';
import type { RxChangeEvent } from 'rxdb';
import type { Observable } from 'rxjs';

/**
 * The local search structure of every searchable collection: one flat folded-text blob per
 * collection, searched with `indexOf` per term and set intersection for AND (#2073, #2411).
 *
 * The enshrined contract (`searchFixtureCatalogue.ts` in sync-core) is "every whitespace-split
 * term of ANY length is a literal substring of the folded search row, any order, across
 * fields" — a grep, not a fulltext problem. A structure sized by the TEXT is cheap: measured
 * 2026-09-16, 20k products = 1 MiB of text, +2 MB heap, <1 ms to build, <1 ms per query;
 * measured 2026-10-07 on dev-pro/dev-next, an order row with its line items is ~50 folded
 * chars and a customer row ~120, so 12k orders or 20k customers are 2–3 MB. The FlexSearch
 * index this replaced was sized by the number of SUBSTRINGS (`tokenize:'full'`): 7.3 KiB per
 * product row, 143 MiB and ~8 s at 20k; 1.5–29 KiB per row on the other collections (#2073).
 * A storage-side `$regex` scan is the other wrong shape — linear in document BYTES.
 *
 * Results are an id SET; ordering is the consumer's query sort. The row text comes from the ONE fold in `search-fields.ts`, fed by the projection read
 * on load and by the legacy snapshot of each change event afterwards, so the two paths cannot
 * index differently. Per tab: every tab or window builds its own from the local collection and
 * keeps it fresh from the collection's change stream.
 */
export type SearchBlob = {
	/** Resolves after the initial collection read; rejects with that read's error. */
	ready: Promise<void>;
	/** Emits once ready, then after every applied change (trailing-throttled). */
	changes$: Observable<void>;
	/** Primary ids whose folded row contains EVERY term; `[]` for no terms. */
	search(terms: string[]): string[];
	dispose(): void;
};

type Blob = { text: string; offsets: Uint32Array; ids: string[] };
type BlobCollection = SearchableCollection;

/** One blob per collection instance AND field list; a panel with other fields gets its own. */
const blobs = new WeakMap<object, Map<string, SearchBlob>>();

/** Rows joined by '\n'; a term can never contain it (the encoder splits on \p{C}). */
const ROW_SEPARATOR = '\n';

function buildBlob(rows: Map<string, string>): Blob {
	const offsets = new Uint32Array(rows.size + 1);
	let position = 0;
	let index = 0;
	for (const row of rows.values()) {
		offsets[index++] = position;
		position += row.length + 1;
	}
	offsets[rows.size] = position;
	return {
		text: [...rows.values()].join(ROW_SEPARATOR) + ROW_SEPARATOR,
		offsets,
		ids: [...rows.keys()],
	};
}

/** The row containing `position`: binary search over the row offsets. */
function rowAt(offsets: Uint32Array, position: number): number {
	let low = 0;
	let high = offsets.length - 2;
	while (low < high) {
		const mid = (low + high + 1) >> 1;
		if (offsets[mid] <= position) low = mid;
		else high = mid - 1;
	}
	return low;
}

/** Every row containing `term`: one indexOf per hit, hopping to the next row after each. */
function termRows(blob: Blob, term: string): Set<number> {
	const rows = new Set<number>();
	let position = blob.text.indexOf(term);
	while (position !== -1) {
		const row = rowAt(blob.offsets, position);
		rows.add(row);
		position = blob.text.indexOf(term, blob.offsets[row + 1]);
	}
	return rows;
}

/**
 * The pure core, for tests and for any caller holding folded rows: ids of every row that
 * contains EVERY term. Rows are `id → folded row text` (see `searchRowText`).
 */
export function searchRows(rows: Map<string, string>, terms: readonly string[]): string[] {
	return blobSearch(buildBlob(rows), terms);
}

function blobSearch(blob: Blob, terms: readonly string[]): string[] {
	// Longest term first: the rarest set seeds the intersection.
	const sorted = [...terms].sort((a, b) => b.length - a.length);
	if (sorted.length === 0) return [];
	let rows = termRows(blob, sorted[0]);
	for (const term of sorted.slice(1)) {
		if (rows.size === 0) break;
		const next = termRows(blob, term);
		rows = new Set([...rows].filter((row) => next.has(row)));
	}
	return [...rows].map((row) => blob.ids[row]);
}

export function searchBlobFor(
	collection: BlobCollection,
	searchFields: readonly string[],
	documentSnapshot: (document: EngineRxDocument) => Record<string, unknown>,
	collectionName: LegacyCollectionName
): SearchBlob {
	const fieldsKey = searchFields.join('|');
	const byFields = blobs.get(collection) ?? new Map<string, SearchBlob>();
	blobs.set(collection, byFields);
	const existing = byFields.get(fieldsKey);
	if (existing) return existing;

	const rows = new Map<string, string>();
	let blob: Blob | undefined;
	let loading = true;
	let disposed = false;
	const buffered: RxChangeEvent<EngineDocument>[] = [];
	const changes = new ReplaySubject<void>(1);
	const rowText = (document: EngineRxDocument) =>
		searchRowText(searchFields, documentSnapshot(document));
	const apply = (event: RxChangeEvent<EngineDocument>) => {
		if (event.operation === 'DELETE') rows.delete(event.documentId);
		else {
			// legacySearchSnapshot reads only toJSON(): the event's data is enough, no hydration.
			rows.set(
				event.documentId,
				rowText({ toJSON: () => event.documentData } as unknown as EngineRxDocument)
			);
		}
		blob = undefined;
	};
	// Subscribe BEFORE the initial read so nothing written during it is lost.
	const subscription = (collection.$ as Observable<RxChangeEvent<EngineDocument>>).subscribe(
		(event) => {
			if (loading) buffered.push(event);
			else {
				apply(event);
				changes.next();
			}
		}
	);
	const dispose = () => {
		if (disposed) return;
		disposed = true;
		subscription.unsubscribe();
		changes.complete();
		rows.clear();
		buffered.length = 0;
		blob = undefined;
		byFields.delete(fieldsKey);
	};
	const ready = (async () => {
		const projected = await searchProjection(collection, collectionName, searchFields);
		if (disposed) return;
		for (const row of projected) rows.set(row.id, searchRowText(searchFields, row.snapshot));
		for (const event of buffered) apply(event);
		buffered.length = 0;
		loading = false;
		changes.next();
	})();
	// A failed read reaches every subscriber (so storage recovery sees it) and the
	// blob leaves the registry, so the next keystroke retries instead of inheriting
	// a dead stream.
	void ready.catch((error: unknown) => {
		changes.error(error);
		dispose();
	});
	const result: SearchBlob = {
		ready,
		changes$: changes.pipe(
			throttleTime(SEARCH_SCAN_RETHROTTLE_MS, asyncScheduler, {
				leading: true,
				trailing: true,
			})
		),
		search: (terms) => blobSearch((blob ??= buildBlob(rows)), terms),
		dispose,
	};
	byFields.set(fieldsKey, result);
	collection.onClose?.push(dispose);
	return result;
}
