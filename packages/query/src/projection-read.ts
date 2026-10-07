import get from 'lodash/get';
import { normalizeMangoQuery, prepareQuery } from 'rxdb';

import type { RxCollection, RxDatabase } from 'rxdb';

export type ProjectionRow = { id: string; values: unknown[] };

/**
 * The slice of an RxCollection a projection read needs. Structural on purpose: the search
 * plane types its collections narrowly (`SearchableCollection`) and hands them here.
 */
export type ProjectionCollection = Pick<RxCollection, 'schema' | 'storageInstance' | 'database'>;

/**
 * A storage read that returns only the named paths of every LIVE document — the seam the
 * catalogue search index is built through (#2242). The engine-neutral reader below satisfies
 * it on every current engine; a SQLite engine registers one that issues
 * `SELECT id, json_extract(data, ...)` so opening a store never parses every product document.
 */
export type ProjectionReader = {
	/**
	 * `paths` are engine-document paths; every non-deleted document, any order. A value is the
	 * PARSED JSON at its path — an object or array where the document holds one (the search
	 * fold walks `payload.line_items`), never JSON text. A SQLite reader must `json_extract`
	 * and parse, or hand such paths to the storage read; `search-fields.test.ts` pins that a
	 * cold projection row folds identically to a live snapshot.
	 */
	readLiveProjection(
		collection: ProjectionCollection,
		paths: readonly string[]
	): Promise<ProjectionRow[]>;
};

/** Engine-neutral storage read: no RxDocument hydration for projection-only consumers. */
export const storageQueryProjectionReader: ProjectionReader = {
	async readLiveProjection(collection, paths) {
		const schema = collection.schema.jsonSchema;
		const { documents } = await collection.storageInstance.query(
			prepareQuery(schema, normalizeMangoQuery(schema, { selector: { _deleted: false } }))
		);
		return documents.map((document) => ({
			id: String(get(document, collection.schema.primaryPath)),
			values: paths.map((path) => get(document, path)),
		}));
	},
};

const readers = new WeakMap<RxDatabase, ProjectionReader>();

/** Registered per database by the platform that opens it; unregistered databases use the storage read. */
export function registerProjectionReader(database: RxDatabase, reader: ProjectionReader): void {
	readers.set(database, reader);
}

export function projectionReaderFor(database: RxDatabase): ProjectionReader {
	return readers.get(database) ?? storageQueryProjectionReader;
}
