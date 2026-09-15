import * as React from 'react';

import { ObservableResource } from 'observable-hooks';
import { combineLatest, defer, from, of, throwError } from 'rxjs';
import { catchError, map, shareReplay, startWith, switchMap } from 'rxjs/operators';

import { useQueryRuntime } from './provider';
import { searchTokens } from './search-match';
import { useLocalCollection$ } from './use-local-collection';
import { recoverLogsCollectionStorage } from './logs-storage-recovery';

import type { QueryResult } from './query-result';
import type { MonoTypeOperatorFunction, Observable } from 'rxjs';
import type {
	MangoQuerySelector,
	MangoQuerySortPart,
	RxCollection,
	RxDatabase,
	RxDocument,
} from 'rxdb';

type LocalDocumentData = Record<string, unknown>;
type LocalDocument = RxDocument<LocalDocumentData>;
type LocalCollection = RxCollection<LocalDocumentData>;

type LocalSearch = {
	collection: LocalCollection;
	find(term: string): Promise<LocalDocument[]>;
};

interface LocalQueryOptions {
	collectionName: 'logs';
	selector?: MangoQuerySelector<LocalDocumentData>;
	sort?: MangoQuerySortPart<LocalDocumentData>[];
	limit?: number;
	search?: string;
}

function recoverAsEmpty<T>(
	collection: LocalCollection,
	emptyValue: T
): MonoTypeOperatorFunction<T> {
	return catchError((error: unknown) =>
		from(recoverLogsCollectionStorage(collection, error)).pipe(
			switchMap((recovered) => {
				return recovered ? of(emptyValue) : throwError(() => error);
			})
		)
	);
}

function withSelector(
	selector: MangoQuerySelector<LocalDocumentData>,
	extra: MangoQuerySelector<LocalDocumentData>
): MangoQuerySelector<LocalDocumentData> {
	return Object.keys(selector).length === 0
		? extra
		: ({ $and: [selector, extra] } as MangoQuerySelector<LocalDocumentData>);
}

function selectorForSearch(
	collection: LocalCollection,
	selector: MangoQuerySelector<LocalDocumentData>,
	documents: LocalDocument[]
): MangoQuerySelector<LocalDocumentData> {
	const primaryPath = collection.schema.primaryPath;
	const ids = documents.map((document) => document.primary);
	return withSelector(selector, {
		[primaryPath]: { $in: ids },
	} as MangoQuerySelector<LocalDocumentData>);
}

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
}

/** The Unicode combining diacritical marks block, as a regex class source. */
const COMBINING_MARK_CLASS = '[\\u0300-\\u036f]';

/**
 * Every BMP code point the encoder folds to a single base character, grouped
 * under that base — ANY script, defined by the encoder's own fold
 * (`foldSearchText`: lowercase + NFD + strip combining marks) rather than by a
 * block list, so the two can never disagree on what counts as the same letter
 * (Codex review: two Latin ranges left Greek tonos and Cyrillic breve
 * unreachable). A folded token is then matched against UNFOLDED stored text:
 * `e` → `[eÉéêë…]`, `υ` → `[υΎύϋΰ…]`.
 *
 * The ORIGINAL code point is what goes in the class: lowercasing can expand
 * (Turkish İ, U+0130 → "i" + U+0307) and the i flag cannot pair such a letter
 * with its plain base, so the character that appears in text is the one
 * listed. Built lazily on the first scan — one pass over the plane is a few
 * milliseconds, and a session that never searches should not pay it.
 */
let accentVariants: ReadonlyMap<string, string> | null = null;
function accentVariantsMap(): ReadonlyMap<string, string> {
	if (accentVariants) return accentVariants;
	const variants = new Map<string, string>();
	const combiningMarks = new RegExp(COMBINING_MARK_CLASS, 'g');
	for (let codePoint = 0x80; codePoint <= 0xffff; codePoint += 1) {
		if (codePoint >= 0xd800 && codePoint <= 0xdfff) continue; // surrogate halves
		const letter = String.fromCodePoint(codePoint);
		const base = letter.toLowerCase().normalize('NFD').replace(combiningMarks, '');
		// Every letter the fold changes at all: the i flag (no u flag) pairs
		// ordinary case pairs but not Kelvin sign → k, Ohm sign → ω or ẞ → ß
		// (Codex review), and listing a pair it does handle costs nothing. A fold
		// that is several code points (Hangul → Jamo) is handled per token below.
		if (base.length !== 1 || base === letter) continue;
		if (!(variants.get(base) ?? '').includes(letter)) {
			variants.set(base, `${variants.get(base) ?? ''}${letter}`);
		}
	}
	accentVariants = variants;
	return variants;
}

/**
 * Stored text may be DECOMPOSED (a base letter followed by combining marks,
 * U+0300–U+036F) rather than precomposed; every letter in the pattern tolerates
 * trailing marks so both forms match (Codex review).
 */
const COMBINING_MARKS = `${COMBINING_MARK_CLASS}*`;

/**
 * A folded token as a regex source that also matches its accented spellings.
 *
 * The token is recomposed to NFC first: the encoder's fold leaves a Hangul
 * syllable as its Jamo sequence, and stored text is normally the composed
 * syllable (Codex review). Each composed character then matches EITHER its
 * composed form (widened by its class, tolerating trailing marks) OR its full
 * NFD expansion, so both stored normal forms are found.
 */
function accentInsensitiveSource(token: string): string {
	const accents = accentVariantsMap();
	return [...token.normalize('NFC')]
		.map((char) => {
			const variants = accents.get(char);
			const letter = variants ? `[${char}${escapeRegex(variants)}]` : escapeRegex(char);
			const composed = `${letter}${COMBINING_MARKS}`;
			const decomposed = char.normalize('NFD');
			return decomposed.length > 1 && !/^.[̀-ͯ]+$/u.test(decomposed)
				? `(?:${composed}|${escapeRegex(decomposed)})`
				: composed;
		})
		.join('');
}

/**
 * The scan-based search for a collection that refuses a FlexSearch index
 * (`options.searchIndex === false` — logs, see the collection creator for the
 * measurement). Every encoder token must appear in at least one searched field,
 * case- and accent-insensitively: the same "each term is somewhere in the
 * record" contract the index gives with `tokenize: 'full'` and the folding
 * encoder, expressed as a mango selector so the STORAGE evaluates it — in the
 * OPFS worker on web, off the main thread — and the query's own `limit` bounds
 * what comes back. The encoder folds the typed term; the stored text is raw, so
 * each folded letter is widened to its accented variants (Codex review: the
 * first cut missed even the exact accented spelling). Terms under the index's
 * minimum length are dropped exactly as the index dropped them (`searchTokens`),
 * so "pull x" still means "pull" and "x" alone selects nothing.
 *
 * `null` means the search cannot select anything (no fields, or a term with no
 * usable token) — callers turn that into "no hits", never into "all rows".
 */
export function scanSelectorFor(
	fields: readonly string[],
	search: string
): MangoQuerySelector<LocalDocumentData> | null {
	const terms = searchTokens(search);
	if (terms.length === 0 || fields.length === 0) return null;
	return {
		$and: terms.map((term) => {
			const source = accentInsensitiveSource(term);
			return { $or: fields.map((field) => ({ [field]: { $regex: source, $options: 'i' } })) };
		}),
	} as MangoQuerySelector<LocalDocumentData>;
}

function scanFieldsFor(collection: LocalCollection): readonly string[] {
	const fields = (collection.options as { searchFields?: unknown } | undefined)?.searchFields;
	return Array.isArray(fields) ? (fields as string[]) : [];
}

function nothingSelector(collection: LocalCollection): MangoQuerySelector<LocalDocumentData> {
	return { [collection.schema.primaryPath]: { $in: [] } } as MangoQuerySelector<LocalDocumentData>;
}

function scanSelector$(
	collection: LocalCollection,
	selector: MangoQuerySelector<LocalDocumentData>,
	search: string
) {
	const scan = scanSelectorFor(scanFieldsFor(collection), search);
	return of(withSelector(selector, scan ?? nothingSelector(collection)));
}

function localQueryResult$(
	collection: LocalCollection,
	locale: string,
	options: LocalQueryOptions
) {
	const selector = options.selector ?? {};
	const search = options.search?.trim() ?? '';
	const refusesIndex =
		(collection.options as { searchIndex?: unknown } | undefined)?.searchIndex === false;
	const selectors$ = !search
		? of(selector)
		: refusesIndex
			? scanSelector$(collection, selector, search)
			: defer(() =>
					from(
						(
							collection as unknown as {
								initSearch(locale: string): Promise<LocalSearch | null>;
							}
						).initSearch(locale)
					)
				).pipe(
					switchMap((searchInstance) =>
						// The plugin returns null when it will not index this collection;
						// the scan is the contract then, not an empty result.
						searchInstance
							? searchInstance.collection.$.pipe(
									startWith(null),
									switchMap(() => from(searchInstance.find(search))),
									map((documents) => selectorForSearch(collection, selector, documents))
								)
							: scanSelector$(collection, selector, search)
					)
				);

	return selectors$.pipe(
		switchMap((matchingSelector) => {
			// No startWith(empty) on these: the first emission must be the real query
			// result, so a descriptor swap in useLocalQuery keeps the previous window
			// on screen instead of flashing an empty table.
			const documents$ = collection
				.find({
					selector: matchingSelector,
					sort: options.sort,
					limit: options.limit,
				})
				.$.pipe(recoverAsEmpty<LocalDocument[]>(collection, []));
			const total$ = collection
				.count({ selector: matchingSelector })
				.$.pipe(recoverAsEmpty<number>(collection, 0));
			return combineLatest([documents$, total$]).pipe(
				map(([documents, count]): QueryResult<LocalCollection> => ({
					searchActive: search.length > 0,
					count,
					hits: documents.map((document) => ({
						id: String(document.primary),
						record: document,
					})),
				}))
			);
		}),
		shareReplay({ bufferSize: 1, refCount: true })
	);
}

/** Direct local-only query binding. It never registers engine demand. */
export const useLocalQuery = (options: LocalQueryOptions) => {
	const runtime = useQueryRuntime();
	const collectionName = options.collectionName;
	const key = JSON.stringify(options);
	const stableOptions = React.useMemo(() => JSON.parse(key) as LocalQueryOptions, [key]);
	// Follow the collection rather than a snapshot of it — see useLocalCollection$.
	const collection$ = useLocalCollection$<LocalDocumentData>(collectionName);
	const result$ = React.useMemo(
		() =>
			collection$.pipe(
				switchMap((collection) =>
					collection
						? localQueryResult$(collection, runtime.locale, stableOptions)
						: of<QueryResult<LocalCollection>>({ searchActive: false, count: 0, hits: [] })
				),
				shareReplay({ bufferSize: 1, refCount: true })
			),
		[collection$, runtime.locale, stableOptions]
	);
	// One resource for the hook's lifetime (mirrors useObservableResource in
	// @wcpos/core query-bindings): reloading retains the current value while the
	// new query loads and clears terminal errors, so a descriptor change never
	// blanks a mounted consumer.
	const [resource] = React.useState(() => new ObservableResource(result$));
	const resourceRef = React.useRef(resource);
	const total$ = React.useMemo(
		() => result$.pipe(map((result) => result.count ?? result.hits.length)),
		[result$]
	);

	React.useEffect(() => {
		if (resource.input$ !== result$) resource.reload(result$);
	}, [resource, result$]);

	React.useEffect(() => {
		const lifetimeResource = resourceRef.current;
		// The resource owns the local RxDB subscriptions for this hook.
		return () => lifetimeResource.destroy();
	}, []);

	return { resource, result$, total$ };
};
