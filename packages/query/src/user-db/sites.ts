import type { SiteCollection, SiteDocument, UserDatabase, UserDocument } from '@wcpos/database';
import { asciiHost } from '@wcpos/utils/ascii-host';
import { getLogger } from '@wcpos/utils/logger';

import { UserDatabaseUnavailableError } from '../commands/printer-profiles';

import type { ReadonlySiteRecord, ReadonlyUserRecord } from './records';

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
 * Return a copy of `data` containing only properties the collection schema knows.
 *
 * The sites schema is `additionalProperties: false`, and the embedded boot path
 * hands the server's `initialProps.site` to `upsertSiteData` verbatim — it never
 * goes through `parseRestResponse`, which prunes for every other ingest path. A
 * server that starts sending one extra field (e.g. `locale`, 2026-08) therefore
 * turns every dev boot into an RxDB VD2 validation error. Pruning here makes the
 * write boundary tolerate any future server-side addition.
 *
 * `parseRestResponse` itself is not usable for this write: it fills every absent
 * schema property with a default, and `upsertSiteData` is a merge — defaults
 * would clobber locally-stored values (the #902 class again).
 */
export function pruneUnknownSiteFields<T extends SiteData>(
	collection: SiteCollection,
	data: T
): SiteData {
	const knownProperties = collection.schema.jsonSchema.properties;
	const copy: SiteData = {};
	for (const key of Object.keys(data)) {
		if (Object.prototype.hasOwnProperty.call(knownProperties, key) && !key.startsWith('_')) {
			copy[key] = data[key];
		}
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
/**
 * Fields where the empty string is never real data, only `parseRestResponse`'s
 * synthesized default for a property the response did not carry. The standalone
 * discovery flow parses the REST index — which does not return `locale` — so a
 * merge that kept the synthesized `''` would erase the locale stored by an
 * earlier embedded boot (the #902 default-clobber class, on the write side).
 */
const OMIT_EMPTY_SITE_FIELDS = ['locale'] as const;

export async function upsertSiteData(
	userDB: UserDatabase | null | undefined,
	siteData: SiteData
): Promise<SiteDocument> {
	if (!userDB) throw new UserDatabaseUnavailableError();
	const collection = userDB.sites;
	const patch = pruneUnknownSiteFields(collection, stripLocalOnlySiteFields(siteData));
	for (const field of OMIT_EMPTY_SITE_FIELDS) {
		if (patch[field] === '') {
			delete patch[field];
		}
	}
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
		if (current._deleted) {
			throw new Error('Cannot link credentials to a removed site');
		}
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

/**
 * The address as an identity: scheme dropped, host lower-cased, trailing
 * slash dropped, port and path kept, so `example.com/staging` is another
 * site and `https://Example.com/` is `example.com`. A missing address
 * compares as empty rather than throwing inside the save.
 * A non-ASCII host compares in its punycode form, so `münchen-laden.de`
 * and `xn--mnchen-laden-dlb.de` are the same site.
 */
export function normalizeSiteAddress(url: string | undefined): string {
	return (url ?? '')
		.replace(/^https?:\/\//i, '')
		.replace(/^[^/]+/, (segment) =>
			segment.replace(/^[^?#\\]+/, (host) => asciiHost(host)).toLowerCase()
		)
		.replace(/\/$/, '');
}

/**
 * The address a connect actually reached, from its discovered API URL: the
 * normalised site address with the REST suffix (`/wp-json/...` or
 * `?rest_route=...`) cut off, so a permalink-style change is not a move but
 * a different host or site path is.
 */
export function connectionAddressOf(apiUrl: string | undefined): string {
	const address = apiUrl ?? '';
	return normalizeSiteAddress(address.slice(0, restSuffixStart(address)));
}

/**
 * Where the REST suffix begins: the first `/wp-json` at a word boundary, or the first
 * `?rest_route=` (with the `/` before it, when there is one), whichever comes first; the
 * string's length when there is neither. A linear scan rather than the alternation regex
 * it replaced, which CodeQL flagged as polynomial on library input (#2706).
 */
function restSuffixStart(address: string): number {
	const lower = address.toLowerCase();
	let cut = lower.length;
	for (let from = 0; ;) {
		const index = lower.indexOf('/wp-json', from);
		if (index === -1) break;
		const next = lower.charAt(index + '/wp-json'.length);
		if (next === '' || !/[a-z0-9_]/.test(next)) {
			cut = index;
			break;
		}
		from = index + 1;
	}
	const rest = lower.indexOf('?rest_route=');
	if (rest !== -1) {
		const start = rest > 0 && lower.charAt(rest - 1) === '/' ? rest - 1 : rest;
		if (start < cut) cut = start;
	}
	return cut;
}

export class SiteIdentityClashError extends Error {
	constructor(public readonly existingName: string | undefined) {
		super('Site identity already belongs to another address');
		this.name = 'SiteIdentityClashError';
	}
}

export async function saveConnectedSite(
	userDB: UserDatabase | null | undefined,
	user: ReadonlyUserRecord | UserDocument,
	siteData: { uuid: string; url: string; name?: string },
	connectionAddress: string | undefined
): Promise<ReadonlySiteRecord> {
	if (!userDB) throw new UserDatabaseUnavailableError();
	if (!siteData.uuid) throw new Error('Cannot save site data without a uuid');
	const parsedData = userDB.sites.parseRestResponse(siteData);
	const existingSite: SiteDocument | null = await userDB.sites.findOneFix(siteData.uuid).exec();
	if (
		existingSite &&
		(normalizeSiteAddress(existingSite.url) !== normalizeSiteAddress(siteData.url) ||
			connectionAddressOf(existingSite.wcpos_api_url) !== connectionAddressOf(connectionAddress))
	)
		throw new SiteIdentityClashError(existingSite.name);
	const siteDoc = await upsertSiteData(userDB, parsedData);
	// Read-only records are the original RxDB instances; mutation is confined to commands.
	const mutableUser = user as UserDocument;
	const currentSites: string[] = mutableUser.getLatest().sites ?? [];
	const siteLogger = getLogger(['wcpos', 'auth', 'site']);
	if (!currentSites.includes(siteData.uuid)) {
		await mutableUser.getLatest().incrementalUpdate({ $push: { sites: siteData.uuid } });
		siteLogger.debug(
			existingSite ? `Re-added site to user: ${siteData.name}` : `Added new site: ${siteData.name}`
		);
	}
	if (existingSite) siteLogger.debug(`Updated site: ${siteData.name}`);
	// Preserve the RxDB instance; typed populateResource makes the two faces invariant.
	return siteDoc.getLatest() as unknown as ReadonlySiteRecord;
}

export async function removeSite(
	user: ReadonlyUserRecord | UserDocument,
	siteUuid: string | undefined
): Promise<void> {
	if (!siteUuid) throw new Error('Cannot remove site without a uuid');
	// Read-only records retain their RxDB identity; only this command opens the write door.
	const mutableUser = user as UserDocument;
	const site = await mutableUser.collection.database.sites.findOne(siteUuid).exec();
	if (!site) throw new Error('Cannot remove missing site');
	const latest = site.getLatest();
	await latest.remove();
	await mutableUser.incrementalUpdate({ $pullAll: { sites: [latest.uuid] } });
}

export class SiteRemovedError extends Error {
	constructor() {
		super('Cannot update a removed site');
		this.name = 'SiteRemovedError';
	}
}

export async function recordSiteInfo(
	site: ReadonlySiteRecord | SiteDocument,
	data: Record<string, unknown>
): Promise<void> {
	const document = site as SiteDocument;
	// Only patch if we have at least one valid field to update
	const hasValidData =
		data.wp_version ||
		data.wc_version ||
		data.wcpos_version ||
		data.wcpos_pro_version ||
		data.license;
	if (hasValidData) {
		if (document.getLatest().deleted) throw new SiteRemovedError();
		const patch: Record<string, unknown> = {
			wp_version: data?.wp_version ?? '',
			wc_version: data?.wc_version ?? '',
			wcpos_version: data?.wcpos_version ?? '',
			wcpos_pro_version: data?.wcpos_pro_version ?? '',
		};
		if (data.license !== undefined) patch.license = data.license || {};
		// The store's filter-added search meta keys (#2411): a filter added after this
		// till connected reaches it here, at launch, not only at the next connect. A
		// plugin that predates the key leaves the saved value alone.
		if (data.search_meta_keys !== undefined) {
			patch.search_meta_keys = data.search_meta_keys || {};
		}
		try {
			await document.incrementalPatch(patch);
		} catch (error) {
			if (document.getLatest().deleted) throw new SiteRemovedError();
			throw error;
		}
	}
}

export async function migrateSiteApiUrl(
	site: ReadonlySiteRecord | SiteDocument,
	apiURL: string
): Promise<void> {
	await (site as SiteDocument).incrementalPatch({ wcpos_api_url: apiURL });
}
