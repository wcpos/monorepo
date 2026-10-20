import type { SiteDocument, UserDatabase, WPCredentialsDocument } from '@wcpos/database';
import { sanitizeWPCredentialsData } from '@wcpos/database/collections/wp-credentials';
import {
	getErrorMessage,
	getLogger,
	isErrorReported,
	markErrorReported,
} from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { UserDatabaseUnavailableError } from '../commands/printer-profiles';
import { mergeIntoDocument } from '../records/merge-into-document';
import { mergeStoresWithResponse } from './stores';
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
 * `date_*` fields, so it is merged, never written wholesale (`mergeIntoDocument`).
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
	return mergeIntoDocument(
		userDB.wp_credentials,
		patch.uuid,
		(current) => {
			const next = { ...current, ...patch };
			// Absent capabilities = unknown = fail open; drop stale ones (use-user-validation rule).
			if (!('capabilities' in patch)) delete (next as { capabilities?: string[] }).capabilities;
			return next;
		},
		() => patch
	);
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

export function credentialsTokenOwner(
	credentials: ReadonlyWpCredentialsRecord | WPCredentialsDocument
) {
	const document = credentials as WPCredentialsDocument;
	const latest = document.getLatest();
	return {
		id: latest.id,
		refresh_token: latest.refresh_token,
		incrementalPatch: document.incrementalPatch.bind(document),
		getLatest: document.getLatest.bind(document),
	};
}

const appLogger = getLogger(['wcpos', 'app', 'validation']);

export async function recordCashierProfile(
	userDB: UserDatabase,
	credentials: ReadonlyWpCredentialsRecord | WPCredentialsDocument,
	data: any,
	{ userUuid, siteUuid }: { userUuid: string | undefined; siteUuid: string | undefined }
): Promise<void> {
	const wpUser = credentials as WPCredentialsDocument;
	const userId = wpUser.id;
	try {
		// Update user fields directly with response data
		const updateData: any = {};
		const fieldsToUpdate = [
			'avatar_url',
			'display_name',
			'email',
			'first_name',
			'last_access',
			'last_name',
			'nice_name',
			'username',
		];

		fieldsToUpdate.forEach((field) => {
			if (data[field] !== undefined) {
				updateData[field] = data[field];
			}
		});

		// Roles can come as an array of slugs (`roles`) or a legacy single
		// string (`role`) from older plugin versions. Normalize to array.
		if (Array.isArray(data.roles)) {
			updateData.roles = data.roles.filter(
				(r: unknown): r is string => typeof r === 'string' && r.length > 0
			);
		} else if (typeof data.role === 'string' && data.role.length > 0) {
			updateData.roles = [data.role];
		}

		// Server omits `capabilities` on plugin versions without the capability
		// payload (absence = unknown = fail open). Never patch the key to
		// `undefined` — RxDB schema validation rejects undefined values (422),
		// which failed the whole login validation and left the user stuck on
		// "Re-authenticate" with no stores. Stale stored caps are cleared via
		// an incrementalModify below instead, which can actually remove a key.
		let clearCapabilities = false;
		if (data.capabilities === undefined) {
			clearCapabilities = true;
		} else if (Array.isArray(data.capabilities)) {
			updateData.capabilities = [
				...new Set(
					data.capabilities.filter(
						(capability: unknown): capability is string =>
							typeof capability === 'string' && capability.length > 0
					)
				),
			];
		}

		// Update user data if we have fields to update
		if (Object.keys(updateData).length > 0) {
			await wpUser.incrementalPatch(updateData);
			appLogger.debug('User data updated successfully', {
				context: {
					userId,
					updatedFields: Object.keys(updateData),
				},
			});
		}

		if (
			clearCapabilities &&
			(wpUser.getLatest() as unknown as { capabilities?: string[] }).capabilities !== undefined
		) {
			await wpUser.getLatest().incrementalModify((docData) => {
				delete (docData as { capabilities?: string[] }).capabilities;
				return docData;
			});
			appLogger.debug('Cleared stale capabilities (server omitted the field)', {
				context: { userId },
			});
		}

		// Merge stores if present in response
		if (data.stores && Array.isArray(data.stores)) {
			appLogger.debug('Merging stores from cashier response', {
				context: {
					userId,
					siteUuid,
					remoteStoreCount: data.stores.length,
					remoteStoreIds: data.stores.map((s: any) => s?.id),
				},
			});
			await mergeStoresWithResponse({
				userDB,
				wpUser,
				remoteStores: data.stores,
				user: { uuid: userUuid ?? '' },
				siteID: siteUuid ?? '',
			});
		} else {
			appLogger.debug('Cashier response has no stores array — skipping merge', {
				context: {
					userId,
					siteUuid,
					dataKeys: Object.keys(data ?? {}),
					storesType: typeof data?.stores,
				},
			});
		}
	} catch (error) {
		// mergeStoresWithResponse already wrote its own row for its failure.
		if (isErrorReported(error)) throw error;
		const errorMsg = getErrorMessage(error);
		appLogger.error('Failed to update user in local database', {
			code: ERROR_CODES.LOCAL_DB_WRITE_FAILED,
			context: {
				error: errorMsg,
				userId,
			},
		});
		// Mark it logged, so the caller's outer catch does not write a second row.
		markErrorReported(error);
		throw error;
	}
}
