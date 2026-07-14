import cloneDeep from 'lodash/cloneDeep';
import { distinctUntilChanged, map } from 'rxjs/operators';

import {
	type EngineDocument,
	type LegacyCollectionName,
	readLegacyField,
	resolveLegacyField,
} from './collection-map';

import type { RxDocument } from 'rxdb';

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
			`Engine adapter method "${method}" is read-only until the increment-3 write funnel is available`
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
	const document = engineDocument(rxDocument);
	const payload = document.payload ?? {};
	return {
		...payload,
		uuid: readLegacyField(collection, document, 'uuid'),
		id: readLegacyField(collection, document, 'id'),
	};
}

/** Wrap an engine RxDocument with the legacy read contract. Writes intentionally fail loudly. */
export function wrapEngineDocument(
	collection: LegacyCollectionName,
	rxDocument: RxDocument<EngineDocument>
): Record<string, unknown> {
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
	);
}
