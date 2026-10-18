import type { UserDatabase } from '@wcpos/database';
import { createUserDB } from '@wcpos/database/create-db';
import { getLogger } from '@wcpos/utils/logger';

import { consumeNewTillOnNextLoad, ensureRegister, remintRegister } from '../register-session';
import { upsertEmbeddedCredentials } from './credentials';
import { upsertSiteData } from './sites';
import {
	generateStoreLocalID,
	insertStorePayloads,
	mergeServerOwnedStoreFields,
	normalizeStorePayload,
} from './stores';

import type { PreparedStorePayload, ServerStorePayload } from './stores';
import type { ReadonlyUserRecord } from './records';
import type { CurrentSessionIDs, SessionAppState, TranslationsState } from './state';

const appLogger = getLogger(['wcpos', 'app', 'hydration']);

export async function openUserDatabase(): Promise<{
	userDB: UserDatabase;
	sessionPointer: SessionAppState;
	translationsCache: TranslationsState;
	user: ReadonlyUserRecord;
}> {
	const userDB = await createUserDB();
	if (!userDB) {
		throw new Error('Failed to create user database');
	}
	const sessionPointer = await userDB.addState('v2');
	const translationsCache = await userDB.addState('translations_v2');
	let user = await userDB.users.findOne().exec();
	if (!user) {
		user = await userDB.users.insert({ first_name: 'Global', last_name: 'User' });
	}

	await ensureRegister(userDB);
	// A restored copy of another installation's database is a cloned till; the copy
	// becomes its own till before anything sells (see new-till-flag.ts).
	if (consumeNewTillOnNextLoad()) await remintRegister(userDB);
	return { userDB, sessionPointer, translationsCache, user };
}

export async function applyEmbeddedBootPayload(
	userDB: UserDatabase,
	{
		site,
		wp_credentials,
		stores: initialStorePayload,
	}: {
		site: Record<string, unknown>;
		wp_credentials?: Record<string, unknown>;
		stores?: ServerStorePayload[];
	},
	user: ReadonlyUserRecord,
	beforeStores?: () => void
): Promise<{
	siteUuid: string | undefined;
	wpCredentialsUuid: string | undefined;
	stores: PreparedStorePayload[];
}> {
	const initialStores = initialStorePayload ?? [];
	// Upsert site and credentials.
	// `upsertSiteData` merges instead of overwriting: a plain `upsert()` is a
	// full-document write and would drop the locally-owned `wp_credentials`
	// link array, which the embedded payload never carries (#902).
	const siteDoc = await upsertSiteData(userDB, site);
	// The credential merges for the same reason: its `stores` links reset to `[]` otherwise.
	const wpCredentialsDoc = await upsertEmbeddedCredentials(userDB, wp_credentials);

	// Core consumes ?store= after credentials succeed, before any store work.
	beforeStores?.();

	const stores = await Promise.all(
		initialStores.map(async (store: ServerStorePayload) => {
			const normalizedStore = normalizeStorePayload(store);
			const localID = await generateStoreLocalID({
				user: user.uuid,
				siteID: siteDoc.uuid,
				wpCredentialsID: wpCredentialsDoc.uuid,
				storeID: normalizedStore.id,
			});

			return {
				...normalizedStore,
				localID,
			};
		})
	);

	// Patch existing documents without touching local preferences; insert new stores.
	const newStores = [];
	for (let index = 0; index < stores.length; index++) {
		const preparedStore = stores[index];
		const existingStore = await userDB.stores.findOne(preparedStore.localID).exec();
		if (existingStore) {
			// Inline initial props come from the free plugin without Pro's store
			// filters, so they never carry `display`; letting them revoke it
			// stopped the customer display service on every reload of /pos/.
			await mergeServerOwnedStoreFields(existingStore, initialStores[index], {
				revokeDisplayOnAbsence: false,
			});
		} else {
			newStores.push(preparedStore);
		}
	}
	const failedDocIds = await insertStorePayloads(userDB, newStores);
	// With no stores, core's selection fails before committing a session. The old
	// step also stopped before patching credential links in that case.
	// A rejected store row was never persisted: it must not be linked, and it must not be
	// offered to the selection either, or the boot selects a store it cannot open and falls
	// back instead of using another store that did insert.
	const persistedStores = stores.filter((store) => !failedDocIds.has(store.localID));
	if (stores.length > 0) {
		await wpCredentialsDoc.patch({ stores: persistedStores.map((store) => store.localID) });
	}
	return {
		siteUuid: siteDoc.uuid,
		wpCredentialsUuid: wpCredentialsDoc.uuid,
		stores: persistedStores,
	};
}

export async function readSiteTransportInputs(
	userDB: UserDatabase,
	pointer: CurrentSessionIDs | null | undefined
) {
	if (pointer?.siteID) {
		const siteDoc = await userDB.sites.findOne(pointer.siteID).exec();
		const wpCredentials = pointer.wpCredentialsID
			? await userDB.wp_credentials.findOne(pointer.wpCredentialsID).exec()
			: null;
		return {
			siteUuid: siteDoc?.uuid,
			wcposApiUrl: siteDoc?.wcpos_api_url,
			wpApiUrl: typeof siteDoc?.wp_api_url === 'string' ? siteDoc.wp_api_url : undefined,
			wcposVersion: siteDoc?.wcpos_version,
			accessToken: wpCredentials?.access_token,
		};
	}
	return {};
}

export async function recordSiteTransport(
	userDB: UserDatabase,
	siteUuid: string,
	flags: {
		useJwtAsParam?: boolean;
		useRestRouteParam?: boolean;
		useProtocolHeaders?: boolean;
		useInstanceHeader?: boolean;
	}
): Promise<void> {
	// RxDB resolves an empty primary id to an arbitrary document.
	if (!siteUuid) return;
	const siteDoc = await userDB.sites.findOne(siteUuid).exec();
	if (siteDoc) {
		await siteDoc.getLatest().incrementalPatch({
			use_jwt_as_param: !!flags.useJwtAsParam,
			use_rest_route_param: !!flags.useRestRouteParam,
			use_protocol_headers: !!flags.useProtocolHeaders,
			use_instance_header: !!flags.useInstanceHeader,
		});
		if (flags.useJwtAsParam) {
			appLogger.info('Site configured to use JWT as query parameter', {
				context: { siteId: siteUuid },
			});
		}
	}
}
