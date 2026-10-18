import type { RxCollection, RxDocument } from 'rxdb';

/**
 * The document data type, read off the collection. Taking `RxCollection<T>` and inferring `T`
 * picks up `DeepReadonlyObject<T>` from the schema members, and the result no longer matches
 * the collection's own document type.
 */
type DocDataOf<C extends RxCollection> = C extends RxCollection<infer T> ? T : never;

/**
 * Create-or-merge a row into a collection without replacing the local document.
 * RxDB's `upsert`/`incrementalUpsert` write their input wholesale when the document exists —
 * every omitted property snaps to its schema default — so a row narrower than the local
 * document (a server row, an embedded payload) must go through `incrementalModify`.
 * `merge` receives the current document data and returns the next; it re-runs on a write
 * conflict, so an in-flight check (`sync_status === 'pending'`) belongs inside it. A document
 * that does not exist is created from `create()` with `insert`, which also revives a tombstone
 * (RxDB accepts an insert over a deleted document). A concurrent create that lands between
 * the lookup and the insert surfaces as a CONFLICT and is merged into, never replaced:
 * `incrementalUpsert` would replace it, and its per-primary queue only serialises creates
 * within one JS context. Returns the live document.
 */
export async function mergeIntoDocument<C extends RxCollection>(
	collection: C,
	primary: string,
	merge: (current: DocDataOf<C>) => DocDataOf<C> | Promise<DocDataOf<C>>,
	create: () => DocDataOf<C>
): Promise<RxDocument<DocDataOf<C>>> {
	const mergeInto = async (doc: RxDocument<DocDataOf<C>>) => {
		await doc.getLatest().incrementalModify(merge);
		return doc.getLatest();
	};
	const existing = await collection.findOne(primary).exec();
	if (existing) return mergeInto(existing);
	const row = create();
	// A row keyed elsewhere would land as a second document and leave `primary` untouched.
	const got = (row as Record<string, unknown>)[collection.schema.primaryPath];
	if (got !== primary)
		throw new Error(`mergeIntoDocument: create() returned primary ${got} for ${primary}`);
	try {
		return await collection.insert(row);
	} catch (error) {
		if ((error as { code?: string }).code !== 'CONFLICT') throw error;
		const created = await collection.findOne(primary).exec();
		if (!created) throw error;
		return mergeInto(created);
	}
}

/** The keys of `data` the collection's schema declares (top-level, not `_`-prefixed). */
export function pruneToSchemaProperties<T extends Record<string, unknown>>(
	collection: RxCollection,
	data: T
): Partial<T> {
	const known = collection.schema.jsonSchema.properties;
	return Object.fromEntries(
		Object.entries(data).filter(
			([key]) => Object.prototype.hasOwnProperty.call(known, key) && !key.startsWith('_')
		)
	) as Partial<T>;
}
