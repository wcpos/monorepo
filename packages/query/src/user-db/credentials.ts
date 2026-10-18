import type { SiteDocument, UserDatabase, WPCredentialsDocument } from '@wcpos/database';
import { sanitizeWPCredentialsData } from '@wcpos/database/collections/wp-credentials';

import { UserDatabaseUnavailableError } from '../commands/printer-profiles';
import { linkCredentialsToSite } from './sites';

import type { ReadonlySiteRecord, ReadonlyWpCredentialsRecord } from './records';

export async function saveLoginCredentials(
	userDB: UserDatabase | null | undefined,
	siteUuid: string | undefined,
	params: {
		uuid: string;
		id: string;
		display_name: string;
		access_token: string;
		refresh_token: string;
		expires_at: number;
	}
): Promise<{ created: boolean; linked: boolean; credentials: ReadonlyWpCredentialsRecord }> {
	if (!userDB) throw new UserDatabaseUnavailableError();
	if (!siteUuid || !params.uuid)
		throw new Error('Cannot save credentials without site and credential uuids');
	// Extract credentials from the response
	const credentialsData = {
		uuid: params.uuid,
		id: parseInt(params.id, 10), // Convert string to number
		display_name: params.display_name,
		access_token: params.access_token,
		refresh_token: params.refresh_token,
		expires_at: Number(params.expires_at), // Convert to number and store the expiration timestamp
		// Set default values for other required fields
		first_name: '',
		last_name: '',
		email: '',
		nice_name: params.display_name,
		last_access: new Date().toISOString(),
		avatar_url: '',
		stores: [],
		date_created_gmt: new Date().toISOString(),
		date_modified_gmt: new Date().toISOString(),
	};

	// Check if credentials already exist
	const existingCredentials = await userDB.wp_credentials
		.findOne({
			selector: { uuid: credentialsData.uuid },
		})
		.exec();
	let credentials;
	if (existingCredentials) {
		await existingCredentials.incrementalPatch(
			sanitizeWPCredentialsData({
				access_token: credentialsData.access_token,
				refresh_token: credentialsData.refresh_token,
				expires_at: credentialsData.expires_at,
				display_name: credentialsData.display_name,
				last_access: credentialsData.last_access,
				date_modified_gmt: credentialsData.date_modified_gmt,
			})
		);
		credentials = existingCredentials.getLatest();
	} else {
		credentials = await userDB.wp_credentials.insert(sanitizeWPCredentialsData(credentialsData));
	}
	const site = await userDB.sites.findOne(siteUuid).exec();
	if (!site) throw new Error('Cannot link credentials to a removed site');
	const linked = await linkCredentialsToSite(site, credentialsData.uuid);
	// Preserve the RxDB instance; typed populateResource makes the two faces invariant.
	return {
		created: !existingCredentials,
		linked,
		credentials: credentials as unknown as ReadonlyWpCredentialsRecord,
	};
}

/**
 * Merge the embedded boot's credential payload over the stored credential.
 * The payload never carries the locally-owned `stores` links, `last_access` or
 * `date_*` fields, and `collection.upsert()` is a full-document write that would
 * reset them to defaults (the #902 class, as `upsertSiteData`).
 */
export async function upsertEmbeddedCredentials(
	userDB: UserDatabase | null | undefined,
	data: unknown
): Promise<WPCredentialsDocument> {
	if (!userDB) throw new UserDatabaseUnavailableError();
	const patch = sanitizeWPCredentialsData(data);
	if (!patch.uuid) throw new Error('Cannot save credentials without a uuid');
	// `stores` holds local store ids the step links afterwards (as LOCAL_ONLY_SITE_FIELDS).
	delete patch.stores;
	const existing = await userDB.wp_credentials.findOne(patch.uuid).exec();
	if (existing) {
		await existing.getLatest().incrementalModify((current) => {
			const next = { ...current, ...patch };
			// Absent capabilities = unknown = fail open; drop stale ones (use-user-validation rule).
			if (!('capabilities' in patch)) delete (next as { capabilities?: string[] }).capabilities;
			return next;
		});
		return existing.getLatest();
	}
	return userDB.wp_credentials.incrementalUpsert(patch as never);
}

export async function removeCredentials(
	site: ReadonlySiteRecord | SiteDocument,
	credentialsUuid: string | undefined
): Promise<void> {
	if (!credentialsUuid) throw new Error('Cannot remove credentials without a uuid');
	// Read-only records retain their RxDB identity; only this command opens the write door.
	const mutableSite = site as SiteDocument;
	const wpUser = await mutableSite.collection.database.wp_credentials
		.findOne(credentialsUuid)
		.exec();
	if (!wpUser) throw new Error('Cannot remove missing credentials');
	await wpUser.incrementalRemove();
	await mutableSite.getLatest().incrementalUpdate({ $pullAll: { wp_credentials: [wpUser.uuid] } });
}
