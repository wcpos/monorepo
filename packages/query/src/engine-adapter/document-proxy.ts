import cloneDeep from 'lodash/cloneDeep';
import { deepEqual } from 'rxdb/plugins/utils';
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

/** Wrap an engine RxDocument with the legacy read contract. Writes intentionally fail loudly. */
export function wrapEngineDocument<TDocument extends object = Record<string, unknown>>(
	collection: LegacyCollectionName,
	rxDocument: RxDocument<EngineDocument>
): TDocument {
	return new Proxy<Record<string, unknown>>(
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
						/**
						 * `deepEqual`, not reference equality — the same call RxDB's own `get$` makes,
						 * for the same reason: every revision produces new object references, so `===`
						 * treats an untouched object or array field as changed and re-emits. That made
						 * `billing$`, `shipping$`, `meta_data$`, `line_items$` and `links$` fire on
						 * every write to their document regardless of what actually moved.
						 *
						 * `deepEqual` short-circuits on `a === b`, so primitives cost one comparison.
						 * The walk is only paid on object fields, and it is far cheaper than the
						 * render it prevents: ~12µs for a 20-line cart, ~123µs at 200 lines.
						 */
						distinctUntilChanged(deepEqual)
					);
				}
				return readLegacyField(collection, engineDocument(rxDocument), property);
			},
		}
	) as TDocument;
}
