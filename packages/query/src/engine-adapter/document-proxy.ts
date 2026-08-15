import cloneDeep from 'lodash/cloneDeep';
import { distinctUntilChanged, map } from 'rxjs/operators';

import {
	type EngineDocument,
	type LegacyCollectionName,
	readLegacyField,
	readSanitizedFieldsFor,
	resolveLegacyField,
} from './collection-map';

import type { RxDocument } from 'rxdb';

export function isEngineRxDocument(value: unknown): value is RxDocument<EngineDocument> {
	if (value === null || typeof value !== 'object') return false;
	const candidate = value as {
		id?: unknown;
		payload?: unknown;
		getLatest?: unknown;
		collection?: unknown;
	};
	return (
		typeof candidate.id === 'string' &&
		candidate.payload !== null &&
		typeof candidate.payload === 'object' &&
		typeof candidate.getLatest === 'function' &&
		candidate.collection !== null &&
		typeof candidate.collection === 'object'
	);
}

const MUTATION_METHODS = new Set([
	'patch',
	'incrementalPatch',
	'incrementalModify',
	'remove',
	'update',
]);

export class EngineAdapterReadOnlyError extends Error {
	public constructor(method: string) {
		super(
			`Engine adapter method "${method}" is read-only. Use useMutation, useLocalMutation, or usePushDocument instead.`
		);
		this.name = 'EngineAdapterReadOnlyError';
	}
}

function engineDocument(rxDocument: RxDocument<EngineDocument>): EngineDocument {
	return rxDocument as EngineDocument;
}

const READ_METHODS = new Set(['toJSON', 'toMutableJSON', 'getLatest', 'get', 'collection']);

function legacySnapshot(
	collection: LegacyCollectionName,
	rxDocument: RxDocument<EngineDocument>
): Record<string, unknown> {
	const document = rxDocument.toJSON() as EngineDocument;
	const payload = document.payload ?? {};
	const snapshot: Record<string, unknown> = {
		...payload,
		uuid: readLegacyField(collection, document, 'uuid'),
		id: readLegacyField(collection, document, 'id'),
	};
	// Overlay sanitized boundary reads without adding fields absent from the payload (#811).
	readSanitizedFieldsFor(collection).forEach((legacy) => {
		if (legacy in payload) snapshot[legacy] = readLegacyField(collection, document, legacy);
	});
	return snapshot;
}

/**
 * Wrapper cache, keyed on the underlying RxDocument instance.
 *
 * This is what preserves document identity across query emissions. Without it every
 * emission built a fresh Proxy for every hit, so a write to ONE row handed React all-new
 * identities for the whole result set — every row and cell in every table reconciled, and
 * the current-order context ticked on writes to unrelated orders.
 *
 * Keying on the instance is safe because RxDB's document cache gives a NEW RxDocument
 * whenever a document's data changes and reuses the instance when it does not — so
 * "same instance" and "same data" are the same statement, and a cached wrapper cannot go
 * stale. That property is pinned by `rxdb-document-identity.probe.test.ts` in
 * `@wcpos/database`, which should be re-run on any RxDB upgrade.
 *
 * A WeakMap, so wrappers are collected with the documents they wrap. The inner Map is keyed
 * by legacy collection name, since the same document could in principle be asked for under
 * more than one.
 */
const WRAPPER_CACHE = new WeakMap<RxDocument<EngineDocument>, Map<LegacyCollectionName, unknown>>();

/** Wrap an engine RxDocument with the legacy read contract. Writes intentionally fail loudly. */
export function wrapEngineDocument<TDocument extends object = Record<string, unknown>>(
	collection: LegacyCollectionName,
	rxDocument: RxDocument<EngineDocument>
): TDocument {
	let byCollection = WRAPPER_CACHE.get(rxDocument);
	if (byCollection) {
		const cached = byCollection.get(collection);
		if (cached) return cached as TDocument;
	} else {
		byCollection = new Map();
		WRAPPER_CACHE.set(rxDocument, byCollection);
	}

	const wrapper = new Proxy<Record<string, unknown>>(
		{},
		{
			// RxDB's isRxDocument() checks `'isInstanceOfRxDocument' in obj`, and
			// consumers use `'field' in doc` guards — the empty target needs a
			// deliberate `has` answer or unchanged screens take not-found branches.
			has: (_target, property) => {
				if (typeof property !== 'string') {
					return false;
				}
				return (
					property === 'isInstanceOfRxDocument' ||
					property === 'primary' ||
					READ_METHODS.has(property) ||
					MUTATION_METHODS.has(property) ||
					property.endsWith('$') ||
					readLegacyField(collection, engineDocument(rxDocument), property) !== undefined
				);
			},
			get: (_target, property) => {
				if (typeof property !== 'string') {
					return undefined;
				}
				if (property === 'isInstanceOfRxDocument') {
					return true;
				}
				if (property === 'primary') {
					return readLegacyField(collection, engineDocument(rxDocument), 'uuid');
				}
				if (property === 'get') {
					return (path: string) => readLegacyField(collection, engineDocument(rxDocument), path);
				}
				if (property === 'collection') {
					return rxDocument.collection;
				}
				if (property === 'toJSON') {
					return () => legacySnapshot(collection, rxDocument);
				}
				if (property === 'toMutableJSON') {
					return () => cloneDeep(legacySnapshot(collection, rxDocument));
				}
				if (property === 'getLatest') {
					return () => wrapEngineDocument(collection, rxDocument.getLatest());
				}
				if (property === '$') {
					return rxDocument.$.pipe(
						map((nextDocument) => wrapEngineDocument(collection, nextDocument))
					);
				}
				if (MUTATION_METHODS.has(property)) {
					return () => {
						throw new EngineAdapterReadOnlyError(property);
					};
				}
				if (property.endsWith('$') && property.length > 1) {
					const legacyField = property.slice(0, -1);
					resolveLegacyField(collection, legacyField);
					return rxDocument.$.pipe(
						map((nextDocument) =>
							readLegacyField(collection, engineDocument(nextDocument), legacyField)
						),
						distinctUntilChanged()
					);
				}
				return readLegacyField(collection, engineDocument(rxDocument), property);
			},
		}
	) as TDocument;

	byCollection.set(collection, wrapper);
	return wrapper;
}
