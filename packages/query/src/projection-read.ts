import get from 'lodash/get';
import { normalizeMangoQuery, prepareQuery } from 'rxdb';

import type { RxCollection } from 'rxdb';

export type ProjectionRow = { id: string; values: unknown[] };

/**
 * The slice of an RxCollection a projection read needs. Structural on purpose: the search
 * plane types its collections narrowly (`SearchableCollection`) and hands them here.
 */
export type ProjectionCollection = Pick<RxCollection, 'schema' | 'storageInstance'>;

/**
 * Every LIVE document's values at the named engine paths, any order, read from storage without
 * building an RxDocument (#2242, the catalogue search index). A value is the PARSED JSON at its
 * path, never JSON text; `search-fields.test.ts` pins that a cold row folds like a live snapshot.
 */
export async function readLiveProjection(
	collection: ProjectionCollection,
	paths: readonly string[]
): Promise<ProjectionRow[]> {
	const schema = collection.schema.jsonSchema;
	const { documents } = await collection.storageInstance.query(
		prepareQuery(schema, normalizeMangoQuery(schema, { selector: { _deleted: false } }))
	);
	return documents.map((document) => ({
		id: String(get(document, collection.schema.primaryPath)),
		values: paths.map((path) => get(document, path)),
	}));
}
