import type { SiteCollection, SiteDocument } from '@wcpos/database';

/**
 * Fields on the site document that are owned by the local app, never by the server.
 *
 * `wp_credentials` is the site↔credential link array written by the login flow.
 * The WordPress REST index never carries it, but `parseRestResponse()` fills every
 * schema property, so a parsed site payload always contains `wp_credentials: []`.
 * Writing that back erases every link created since the payload was parsed (#902).
 */
export const LOCAL_ONLY_SITE_FIELDS = ['wp_credentials'] as const;

type SiteData = Record<string, unknown>;

/**
 * Return a copy of `data` without the fields the server has no say over.
 */
export function stripLocalOnlySiteFields<T extends SiteData>(data: T): T {
	const copy = { ...data };
	for (const field of LOCAL_ONLY_SITE_FIELDS) {
		delete copy[field];
	}
	return copy;
}

/**
 * Merge server-owned site data into the sites collection without clobbering
 * locally-owned fields.
 *
 * Writes go through `incrementalModify` so the merge is re-applied against the
 * newest document state on a revision conflict — a plain `incrementalPatch()`
 * (or `collection.upsert()`, which is a full-document overwrite) replays a
 * snapshot that was computed before the conflicting write landed.
 */
export async function upsertSiteData(
	collection: SiteCollection,
	siteData: SiteData
): Promise<SiteDocument> {
	const patch = stripLocalOnlySiteFields(siteData);
	const primary = patch[collection.schema.primaryPath] as string | undefined;

	if (!primary) {
		throw new Error('Cannot save site data without a uuid');
	}

	const merge = async (doc: SiteDocument) => {
		await doc.getLatest().incrementalModify((current) => ({ ...current, ...patch }));
		return doc.getLatest();
	};

	const existing = await collection.findOne(primary).exec();
	if (existing) {
		return merge(existing);
	}

	/**
	 * No live document. Either the site has never been saved, or it is a tombstone
	 * from a site the user removed — removal takes the linked credential documents
	 * with it (`populate` preRemove), so there is no link array left to preserve and
	 * a create-or-revive write is safe. `incrementalUpsert` covers both and queues
	 * per primary key, so two connects for the same new site cannot both insert.
	 */
	return collection.incrementalUpsert(patch as never);
}

/**
 * Link a WordPress credential to a site.
 *
 * The read of the current link array happens *inside* the modifier so the
 * append is atomic: RxDB re-runs the modifier against the newest document state
 * when the write conflicts, instead of replaying an array that was read before
 * the conflicting write landed.
 *
 * Returns `true` when the link was added, `false` when it was already there.
 */
export async function linkCredentialsToSite(
	site: SiteDocument,
	credentialsUuid: string
): Promise<boolean> {
	const latest = site.getLatest();

	/**
	 * Writing to a tombstone silently "succeeds" — the caller would report a
	 * successful login against a site the user just removed, which is the same
	 * class of dead end #902 was about.
	 */
	if (latest.deleted) {
		throw new Error('Cannot link credentials to a removed site');
	}

	const linked = Array.isArray(latest.wp_credentials) ? latest.wp_credentials : [];
	if (linked.includes(credentialsUuid)) {
		return false;
	}

	// Set by the modifier, which may run more than once — the last run is the
	// one that was actually written.
	let appended = false;

	await latest.incrementalModify((current) => {
		const currentLinks = Array.isArray(current.wp_credentials) ? current.wp_credentials : [];
		if (currentLinks.includes(credentialsUuid)) {
			appended = false;
			return current;
		}
		appended = true;
		return { ...current, wp_credentials: [...currentLinks, credentialsUuid] };
	});

	return appended;
}
