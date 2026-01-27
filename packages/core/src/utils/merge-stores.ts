import * as Crypto from 'expo-crypto';

import type { StoreDocument, UserDatabase, WPCredentialsDocument } from '@wcpos/database';
import { getLogger } from '@wcpos/utils/logger';

const appLogger = getLogger(['wcpos', 'app', 'stores']);

/**
 * Generate a unique localID for stores
 */
async function generateHashId(dataObject: {
	user: string;
	siteID: string;
	wpCredentialsID: string;
	storeID: number;
}) {
	// Convert the object to a JSON string
	const dataString = JSON.stringify(dataObject);

	// Create a SHA-256 hash of the string
	const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, dataString, {
		encoding: Crypto.CryptoEncoding.HEX,
	});

	// Return the first 10 characters of the hash
	return hash.substring(0, 10);
}

/**
 * Merge remote stores data with local stores, handling additions, updates, and removals
 */
export async function mergeStoresWithResponse({
	userDB,
	wpUser,
	remoteStores,
	user,
	siteID,
}: {
	userDB: UserDatabase;
	wpUser: WPCredentialsDocument;
	remoteStores: { id: number; [key: string]: any }[];
	user: { uuid: string };
	siteID: string;
}) {
	try {
		// Get current stores populated from wpUser
		const currentStores: StoreDocument[] = await wpUser.populate('stores');
		const currentStoreMap = new Map(currentStores.map((store) => [store.id, store]));

		// Generate localIDs for remote stores and prepare for upsert
		const remoteStoresWithLocalID = await Promise.all(
			remoteStores.map(async (store) => {
				const localID = await generateHashId({
					user: user.uuid,
					siteID,
					wpCredentialsID: wpUser.uuid,
					storeID: store.id,
				});

				return {
					...store,
					localID,
				};
			})
		);

		// Create maps for easier lookup
		const remoteStoreMap = new Map(remoteStoresWithLocalID.map((store) => [store.id, store]));
		const remoteStoreIds = new Set(remoteStores.map((store) => store.id));

		// Find stores to remove (exist locally but not in remote response)
		const storesToRemove = currentStores.filter((store) => !remoteStoreIds.has(store.id));

		// Remove stores that are no longer in the response
		if (storesToRemove.length > 0) {
			const storeIdsToRemove = storesToRemove.map((store) => store.localID);
			await userDB.stores.bulkRemove(storeIdsToRemove);
			appLogger.debug('Removed stores no longer in response', {
				context: {
					removedStoreIds: storesToRemove.map((store) => store.id),
					removedLocalIDs: storeIdsToRemove,
				},
			});
		}

		// Upsert stores from the response (this handles both new and existing stores)
		if (remoteStoresWithLocalID.length > 0) {
			await userDB.stores.bulkInsert(remoteStoresWithLocalID); // will not overwrite existing data
			appLogger.debug('Upserted stores from response', {
				context: {
					storeIds: remoteStoresWithLocalID.map((store) => store.id),
					localIDs: remoteStoresWithLocalID.map((store) => store.localID),
				},
			});
		}

		// Update wpUser.stores with the new array of localIDs
		const newStoreLocalIDs = remoteStoresWithLocalID.map((store) => store.localID);
		await wpUser.incrementalPatch({
			stores: newStoreLocalIDs,
		});

		appLogger.debug('Successfully merged stores with response', {
			context: {
				totalRemoteStores: remoteStores.length,
				removedStores: storesToRemove.length,
				finalStoreCount: newStoreLocalIDs.length,
			},
		});

		return newStoreLocalIDs;
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		appLogger.error('Failed to merge stores with response', {
			context: {
				error: errorMsg,
				wpUserUuid: wpUser.uuid,
				remoteStoreCount: remoteStores?.length || 0,
			},
		});
		throw error;
	}
}
