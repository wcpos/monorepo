import { Observable } from 'rxjs';

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
	find(query: { selector: MangoQuerySelector<EngineDocument> }): {
		$: Observable<EngineRxDocument[]>;
	};
};

export type AdapterDatabase = {
	collections: Record<string, AdapterCollection>;
};

export type AdapterQueryResult = {
	hits: EngineRxDocument[];
	count: number;
	elapsed: number;
};

export type ExecuteAdapterQueryOptions = {
	database: AdapterDatabase;
	collection: LegacyCollectionName;
	selector?: LegacyMangoSelector;
	sort?: MangoQuerySortPart<EngineDocument>[];
	skip?: number;
	limit?: number;
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

/** Execute a legacy-shaped query reactively against an engine RxDB collection. */
export function executeAdapterQuery({
	database,
	collection,
	selector = {},
	sort = [],
	skip = 0,
	limit,
}: ExecuteAdapterQueryOptions): Observable<AdapterQueryResult> {
	const { prefilter, residual } = translateSelector(collection, selector);
	const engineCollectionName = collectionMap[collection].engineCollection;
	const engineCollection = database.collections[engineCollectionName];
	if (!engineCollection) {
		// DEGRADE, don't die: the engine database hasn't opened this collection
		// yet (cold start, before `engine.ready` settles). Emit an empty result so
		// a bound read stays constructible and renders; db$ rebinds it to
		// the live collection once the engine opens (ADR 0023 increment 1b).
		return new Observable<AdapterQueryResult>((subscriber) => {
			subscriber.next({ hits: [], count: 0, elapsed: 0 });
		});
	}
	const query = engineCollection.find({ selector: prefilter });

	return new Observable<AdapterQueryResult>((subscriber) => {
		const startedAt = Date.now();
		const subscription = query.$.subscribe({
			next: (documents) => {
				const matching = documents.filter((document) => residual(document as EngineDocument));
				const ordered = sortDocuments(collection, matching, sort);
				const offset = Math.max(0, skip);
				const hits =
					limit === undefined
						? ordered.slice(offset)
						: ordered.slice(offset, offset + Math.max(0, limit));
				subscriber.next({
					hits,
					count: matching.length,
					elapsed: Date.now() - startedAt,
				});
			},
			error: (error: unknown) => subscriber.error(error),
			complete: () => subscriber.complete(),
		});
		return () => subscription.unsubscribe();
	});
}
