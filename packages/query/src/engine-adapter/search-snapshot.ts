import set from 'lodash/set';

import {
	type EngineDocument,
	type LegacyCollectionName,
	readLegacyField,
	resolveLegacyField,
} from './collection-map';
import { type ProjectionCollection, projectionReaderFor } from '../projection-read';
import { searchFieldTopSegment } from '../search-fields';

import type { RxDocument } from 'rxdb';

export type SearchProjectionRow = { id: string; snapshot: Record<string, unknown> };

/**
 * The search fields of every live record, read as a projection rather than as documents
 * (#2242) and returned in the SAME legacy shape `legacySearchSnapshot` gives a change event,
 * so one fold (`searchRowText`) serves both. A field with its own map entry (`number`, a
 * promoted column) is projected at its engine path; a plain payload field is projected at
 * its top-level segment, so `line_items.name` reads `payload.line_items` once and the fold
 * walks the array. A computed mapping cannot be projected and is refused rather than read wrong.
 */
export async function searchProjection(
	collection: ProjectionCollection,
	name: LegacyCollectionName,
	fields: readonly string[]
): Promise<SearchProjectionRow[]> {
	const reads = new Map<
		string,
		{ path: string; place: string; read?: (value: unknown) => unknown }
	>();
	for (const field of fields) {
		const mapping = resolveLegacyField(name, field);
		if (mapping.compute) {
			throw new Error(
				`Search field "${mapping.legacy}" on ${name} is computed and cannot be read as a projection`
			);
		}
		const isDefaultPayload =
			mapping.kind === 'payload' &&
			mapping.enginePath === `payload.${field}` &&
			!mapping.read &&
			!mapping.readEnginePath;
		const place = isDefaultPayload ? searchFieldTopSegment(field) : field;
		if (reads.has(place)) continue;
		reads.set(place, {
			path: isDefaultPayload ? `payload.${place}` : (mapping.readEnginePath ?? mapping.enginePath),
			place,
			read: mapping.read,
		});
	}
	const entries = [...reads.values()];
	const rows = await projectionReaderFor(collection.database).readLiveProjection(
		collection,
		entries.map((entry) => entry.path)
	);
	return rows.map((row) => {
		const snapshot: Record<string, unknown> = {};
		row.values.forEach((value, index) => {
			const entry = entries[index];
			set(snapshot, entry.place, entry.read ? entry.read(value) : value);
		});
		return { id: row.id, snapshot };
	});
}

/**
 * The legacy-shaped snapshot of one engine record: `payload` flattened to the top level,
 * `uuid`/`id` overlaid in legacy vocabulary, sanitized boundary reads applied (#811) without
 * adding fields absent from the payload.
 *
 * This is the ONE implementation of that flattening. Its sole consumer is the search plane
 * (`engine-query.ts`'s `documentSnapshot`): `SEARCH_FIELDS` are legacy flattened spellings
 * (`name`, `billing.first_name`, `line_items.name`) walked against this shape by
 * `searchRowText`. The blob is rebuilt from storage on every open, so a change here needs no
 * version bump — it is simply what the next open indexes.
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
