import { type EngineDocument, type LegacyCollectionName, readLegacyField } from './collection-map';

import type { RxDocument } from 'rxdb';

/**
 * The legacy-shaped snapshot of one engine record: `payload` flattened to the top level,
 * `uuid`/`id` overlaid in legacy vocabulary, sanitized boundary reads applied (#811) without
 * adding fields absent from the payload.
 *
 * This is the ONE implementation of that flattening. Its sole consumer is the search plane
 * (`engine-query.ts`'s `documentSnapshot`): `LEGACY_SEARCH_FIELDS` are
 *    legacy flattened spellings (`name`, `billing.first_name`) resolved by `lodash/get`
 *    against this shape, in both the FlexSearch `docToString` and the short-term prefix
 *    filter. The FlexSearch index is checkpoint-persisted and never re-tokenized, so any
 *    change to this output must be paired with a `SEARCH_INDEX_VERSION` bump in
 *    `@wcpos/database`'s search plugin.
 */
export function legacySearchSnapshot(
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
	if (collection === 'variations' && 'attributes' in payload) {
		snapshot.attributes = readLegacyField(collection, document, 'attributes');
	}
	return snapshot;
}
