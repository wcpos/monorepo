import {
	type EngineDocument,
	type LegacyCollectionName,
	readLegacyField,
	resolveLegacyField,
} from './collection-map';
import { type ProjectionCollection, projectionReaderFor } from '../projection-read';

import type { RxDocument } from 'rxdb';

export type SearchProjectionRow = { id: string; fields: string[] };

/**
 * The search fields of every live record, read as a projection rather than as documents
 * (#2242): the blob, the document scan and the short-prefix path only ever fold these strings.
 * Legacy search fields resolve to plain engine paths (`LEGACY_SEARCH_FIELDS` are all payload or
 * promoted columns); a computed mapping cannot be projected and is refused rather than read wrong.
 */
export async function searchProjection(
	collection: ProjectionCollection,
	name: LegacyCollectionName,
	fields: readonly string[]
): Promise<SearchProjectionRow[]> {
	const mappings = fields.map((field) => resolveLegacyField(name, field));
	const computed = mappings.find((mapping) => mapping.compute);
	if (computed) {
		throw new Error(
			`Search field "${computed.legacy}" on ${name} is computed and cannot be read as a projection`
		);
	}
	const paths = mappings.map((mapping) => mapping.readEnginePath ?? mapping.enginePath);
	const rows = await projectionReaderFor(collection.database).readLiveProjection(collection, paths);
	return rows.map((row) => ({
		id: row.id,
		fields: row.values.map((value, index) => {
			const read = mappings[index].read;
			return String((read ? read(value) : value) ?? '');
		}),
	}));
}

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
