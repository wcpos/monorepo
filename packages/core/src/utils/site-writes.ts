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

	try {
		return await collection.insert(patch as never);
	} catch (err) {
		/**
		 * Someone inserted the same site between our lookup and our insert.
		 * Fall back to the atomic merge so the loser of the race does not
		 * overwrite the winner's document.
		 */
		const raced = await collection.findOne(primary).exec();
		if (!raced) {
			throw err;
		}
		return merge(raced);
	}
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
	const linked = Array.isArray(latest.wp_credentials) ? latest.wp_credentials : [];
	if (linked.includes(credentialsUuid)) {
		return false;
	}

	await latest.incrementalModify((current) => {
		const currentLinks = Array.isArray(current.wp_credentials) ? current.wp_credentials : [];
		if (currentLinks.includes(credentialsUuid)) {
			return current;
		}
		return { ...current, wp_credentials: [...currentLinks, credentialsUuid] };
	});

	return true;
}
