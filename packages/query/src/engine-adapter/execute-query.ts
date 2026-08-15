import { combineLatest, Observable } from 'rxjs';

import {
	collectionMap,
	type EngineDocument,
	type LegacyCollectionName,
	readLegacyField,
	resolveLegacyField,
} from './collection-map';
import { type LegacyMangoSelector, translateSelector } from './translate-selector';

import type { MangoQuerySelector, MangoQuerySortPart, RxDocument } from 'rxdb';

export type EngineRxDocument = RxDocument<EngineDocument>;

type AdapterCollection = {
	find(query: {
		selector: MangoQuerySelector<EngineDocument>;
		sort?: MangoQuerySortPart<EngineDocument>[];
		skip?: number;
		limit?: number;
	}): {
		$: Observable<EngineRxDocument[]>;
	};
	count(query: { selector: MangoQuerySelector<EngineDocument> }): {
		$: Observable<number>;
	};
};

export type AdapterDatabase = {
	collections: Record<string, AdapterCollection>;
};

export type AdapterQueryResult = {
	hits: EngineRxDocument[];
	count: number;
};

export type CompiledSortPart = {
	direction: 'asc' | 'desc';
	enginePath?: string;
	value: (document: EngineDocument) => unknown;
};

export type CompiledQueryRead = {
	prefilter: MangoQuerySelector<EngineDocument>;
	residual: (document: EngineDocument) => boolean;
	complete: boolean;
	sort: CompiledSortPart[];
	sortPushable: boolean;
	limit?: number;
	search: string;
	searchFields?: string[];
};

export type ExecuteAdapterQueryOptions = {
	database: AdapterDatabase;
	collection: LegacyCollectionName;
	selector?: LegacyMangoSelector;
	sort?: MangoQuerySortPart<EngineDocument>[];
	skip?: number;
	limit?: number;
	read?: CompiledQueryRead;
};

function comparableValue(
	collection: LegacyCollectionName,
	document: EngineRxDocument,
	legacyField: string
): unknown {
	const value = readLegacyField(collection, document as EngineDocument, legacyField);
	const mapping = resolveLegacyField(collection, legacyField);
	if (mapping.numeric) {
		const numeric = Number(value);
		return Number.isNaN(numeric) ? Number.NEGATIVE_INFINITY : numeric;
	}
	return value;
}

function compareValues(left: unknown, right: unknown): number {
	if (Object.is(left, right)) {
		return 0;
	}
	if (left === undefined || left === null) {
		return -1;
	}
	if (right === undefined || right === null) {
		return 1;
	}
	if (typeof left === 'number' && typeof right === 'number') {
		return left < right ? -1 : 1;
	}
	// RxDB's comparator uses plain `<` ordering for strings (code-unit order,
	// 'Zoo' before 'apple') — localeCompare would silently reorder after the
	// engine swap.
	const leftString = String(left);
	const rightString = String(right);
	if (leftString === rightString) {
		return 0;
	}
	return leftString < rightString ? -1 : 1;
}

function sortDocuments(
	collection: LegacyCollectionName,
	documents: EngineRxDocument[],
	sort: MangoQuerySortPart<EngineDocument>[]
): EngineRxDocument[] {
	return [...documents].sort((left, right) => {
		for (const part of sort) {
			const [legacyField, direction] = Object.entries(part)[0] ?? [];
			if (!legacyField) {
				continue;
			}
			const comparison = compareValues(
				comparableValue(collection, left, legacyField),
				comparableValue(collection, right, legacyField)
			);
			if (comparison !== 0) {
				return direction === 'desc' ? -comparison : comparison;
			}
		}
		return String(left.id).localeCompare(String(right.id));
	});
}

function sortCompiledDocuments(
	documents: EngineRxDocument[],
	sort: CompiledSortPart[]
): EngineRxDocument[] {
	return [...documents].sort((left, right) => {
		for (const part of sort) {
			const comparison = compareValues(part.value(left), part.value(right));
			if (comparison !== 0) return part.direction === 'desc' ? -comparison : comparison;
		}
		return String(left.id).localeCompare(String(right.id));
	});
}

function translateSort(
	collection: LegacyCollectionName,
	sort: MangoQuerySortPart<EngineDocument>[]
): { pushable: boolean; sort: MangoQuerySortPart<EngineDocument>[] } {
	const translated: MangoQuerySortPart<EngineDocument>[] = [];
	for (const part of sort) {
		const [legacyField, direction] = Object.entries(part)[0] ?? [];
		if (!legacyField) {
			return { pushable: false, sort: [] };
		}
		const mapping = resolveLegacyField(collection, legacyField);
		if (
			mapping.compute ||
			mapping.numeric ||
			mapping.readEnginePath !== undefined ||
			(mapping.kind !== 'promoted' && mapping.kind !== 'identifier') ||
			mapping.enginePath.includes('.')
		) {
			return { pushable: false, sort: [] };
		}
		translated.push({ [mapping.enginePath]: direction });
	}
	return { pushable: true, sort: translated };
}

/** Execute a legacy-shaped query reactively against an engine RxDB collection. */
export function executeAdapterQuery({
	database,
	collection,
	selector = {},
	sort = [],
	skip = 0,
	limit,
	read,
}: ExecuteAdapterQueryOptions): Observable<AdapterQueryResult> {
	const compiledWithSearch = read && Object.keys(selector).length > 0;
	const selectorRead =
		!read || compiledWithSearch ? translateSelector(collection, selector) : undefined;
	const prefilter = read
		? ((compiledWithSearch
				? { $and: [read.prefilter, selectorRead!.prefilter] }
				: read.prefilter) as MangoQuerySelector<EngineDocument>)
		: selectorRead!.prefilter;
	const residual = read
		? (document: EngineDocument) =>
				read.residual(document) && (!compiledWithSearch || selectorRead!.residual(document))
		: selectorRead!.residual;
	const complete = read
		? read.complete && (!compiledWithSearch || selectorRead!.complete)
		: selectorRead!.complete;
	const engineSort = read
		? {
				pushable: read.sortPushable,
				sort: read.sort.map((part) => ({ [part.enginePath!]: part.direction })),
			}
		: translateSort(collection, sort);
	const effectiveSkip = skip;
	const effectiveLimit = read?.limit ?? limit;
	const engineCollectionName = collectionMap[collection].engineCollection;
	const engineCollection = database.collections[engineCollectionName];
	if (!engineCollection) {
		// DEGRADE, don't die: the engine database hasn't opened this collection
		// yet (cold start, before `engine.ready` settles). Emit an empty result so
		// a bound read stays constructible and renders; db$ rebinds it to
		// the live collection once the engine opens (ADR 0023 increment 1b).
		return new Observable<AdapterQueryResult>((subscriber) => {
			subscriber.next({ hits: [], count: 0 });
		});
	}
	if (complete && engineSort.pushable) {
		const query = engineCollection.find({
			selector: prefilter,
			sort: engineSort.sort.length > 0 ? engineSort.sort : [{ id: 'asc' }],
			skip: Math.max(0, effectiveSkip),
			...(effectiveLimit !== undefined ? { limit: Math.max(0, effectiveLimit) } : {}),
		});
		const count = engineCollection.count({ selector: prefilter });

		return new Observable<AdapterQueryResult>((subscriber) => {
			const subscription = combineLatest([query.$, count.$]).subscribe({
				next: ([documents, total]) => {
					subscriber.next({
						hits: documents,
						count: total,
					});
				},
				error: (error: unknown) => subscriber.error(error),
				complete: () => subscriber.complete(),
			});
			return () => subscription.unsubscribe();
		});
	}
	const query = engineCollection.find({ selector: prefilter });

	return new Observable<AdapterQueryResult>((subscriber) => {
		const subscription = query.$.subscribe({
			next: (documents) => {
				const matching = complete
					? documents
					: documents.filter((document) => residual(document as EngineDocument));
				const ordered = read
					? sortCompiledDocuments(matching, read.sort)
					: sortDocuments(collection, matching, sort);
				const offset = Math.max(0, effectiveSkip);
				const hits =
					effectiveLimit === undefined
						? ordered.slice(offset)
						: ordered.slice(offset, offset + Math.max(0, effectiveLimit));
				subscriber.next({
					hits,
					count: matching.length,
				});
			},
			error: (error: unknown) => subscriber.error(error),
			complete: () => subscriber.complete(),
		});
		return () => subscription.unsubscribe();
	});
}
