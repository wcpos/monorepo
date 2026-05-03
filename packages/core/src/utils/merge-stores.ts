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
 * Normalize a store payload coming from the server so it matches the current
 * schema regardless of which plugin version emitted it.
 *
 * Pre-v1.9.0 plugins emitted `opening_hours` as a single freeform string.
 * v1.9.0+ emits `opening_hours` as an array of day entries plus an optional
 * `opening_hours_notes` string. To keep both shapes acceptable without
 * bifurcating the schema, we coerce string-shaped opening_hours into the
 * new shape here: text goes into `opening_hours_notes`, structured array
 * becomes empty.
 */
const VALID_TAX_BASED_ON_VALUES = new Set(['shipping', 'billing', 'base']);

function normalizeStorePayload<T extends { id: number; [key: string]: any }>(store: T): T {
	const out: any = { ...store };

	if (!VALID_TAX_BASED_ON_VALUES.has(out.tax_based_on)) {
		out.tax_based_on = 'base';
	}

	if (typeof out.opening_hours === 'string') {
		const legacyText = out.opening_hours;
		out.opening_hours = [];
		// Don't clobber notes if the server already sent one alongside.
		if (!out.opening_hours_notes) {
			out.opening_hours_notes = legacyText;
		}
	} else if (out.opening_hours != null && !Array.isArray(out.opening_hours)) {
		// Any other unexpected shape — drop to default rather than error.
		out.opening_hours = [];
	}

	// tax_ids: server may omit the field entirely on older plugin versions.
	// Coerce to [] so RxDB validation against the v8 schema doesn't reject
	// otherwise-valid store payloads.
	if (!Array.isArray(out.tax_ids)) {
		out.tax_ids = [];
	}

	return out;
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

		// Generate localIDs for remote stores and prepare for upsert.
		// Normalize first so payloads from older plugin versions still validate
		// against the current schema (see normalizeStorePayload).
		const remoteStoresWithLocalID = await Promise.all(
			remoteStores.map(async (store) => {
				const normalized = normalizeStorePayload(store);
				const localID = await generateHashId({
					user: user.uuid,
					siteID,
					wpCredentialsID: wpUser.uuid ?? '',
					storeID: normalized.id,
				});

				return {
					...normalized,
					localID,
				};
			})
		);

		// Create set for easier lookup
		const remoteStoreIds = new Set(remoteStores.map((store) => store.id));

		// Find stores to remove (exist locally but not in remote response)
		const storesToRemove = currentStores.filter(
			(store) => store.id != null && !remoteStoreIds.has(store.id)
		);

		// Remove stores that are no longer in the response
		if (storesToRemove.length > 0) {
			const storeIdsToRemove = storesToRemove.map((store) => store.localID!);
			await userDB.stores.bulkRemove(storeIdsToRemove);
			appLogger.debug('Removed stores no longer in response', {
				context: {
					removedStoreIds: storesToRemove.map((store) => store.id),
					removedLocalIDs: storeIdsToRemove,
				},
			});
		}

		// Upsert stores from the response (this handles both new and existing stores)
		// `failedDocIds` collects localIDs for non-conflict bulkInsert errors so we
		// can exclude them from wpUser.stores — otherwise a 422/write failure would
		// leave wpUser pointing at a missing store doc and StoreSelect would
		// silently drop it.
		const failedDocIds = new Set<string>();
		if (remoteStoresWithLocalID.length > 0) {
			const bulkResult: any = await userDB.stores.bulkInsert(remoteStoresWithLocalID);
			if (bulkResult?.error?.length) {
				// bulkInsert resolves successfully even when every doc failed — the caller
				// has to inspect `error` or it looks like the merge worked.
				// Partition errors: 409 (conflict) means the doc already exists, which is
				// expected on re-sync — log at debug, don't toast. Everything else (422
				// validation, write errors, etc.) gets surfaced to the user.
				const conflicts: any[] = [];
				const failures: any[] = [];
				for (const err of bulkResult.error) {
					if (err?.status === 409) {
						conflicts.push(err);
					} else {
						failures.push(err);
						// Errors usually carry `documentId`, but some failure modes (e.g.
						// storage-level errors thrown before the doc id is attached) only
						// expose the raw doc via `err.document.localID`. Fall back so we
						// never leave wpUser.stores pointing at an unpersisted id.
						const failedId: string | undefined =
							err?.documentId ?? err?.document?.localID ?? err?.id;
						if (failedId) {
							failedDocIds.add(failedId);
						}
					}
				}

				if (conflicts.length > 0) {
					appLogger.debug('[stores] bulkInsert conflicts (doc already exists)', {
						context: {
							conflictCount: conflicts.length,
							conflictDocIds: conflicts.map((c) => c?.documentId),
						},
					});
				}

				if (failures.length > 0) {
					const summaries = failures.map((err: any) => {
						const validationErrors: { message?: string; path?: string }[] =
							err?.parameters?.errors ??
							err?.parameters?.validationErrors ??
							err?.validationErrors ??
							[];
						const detail =
							validationErrors
								.map((v) => (v.path ? `${v.path}: ${v.message}` : v.message))
								.filter(Boolean)
								.join('; ') ||
							err?.message ||
							`status ${err?.status ?? 'unknown'}`;
						return { documentId: err?.documentId, detail };
					});
					const toastMessage = `Failed to save ${summaries.length} store${summaries.length === 1 ? '' : 's'}: ${summaries
						.map((s: { detail: string }) => s.detail)
						.join(' | ')}`;
					appLogger.error(toastMessage, {
						showToast: true,
						context: {
							errorCode: 'STORE_VALIDATION_FAILED',
							failures: summaries,
							// Include the raw first error for deep debugging
							rawFirstError: JSON.stringify(failures[0] ?? null, (_k, v) =>
								v instanceof Error ? { name: v.name, message: v.message, stack: v.stack } : v
							),
						},
					});
				}
			}
			appLogger.debug('[stores] bulkInsert result', {
				context: {
					successCount: bulkResult?.success?.length ?? 0,
					errorCount: bulkResult?.error?.length ?? 0,
				},
			});

			// Always update wc_price_decimals from the server on every sync.
			// This field is server-authoritative and used for tax/discount calculations.
			// Unlike price_num_decimals (which users can override locally for display),
			// wc_price_decimals must always match WC's wc_get_price_decimals().
			for (let i = 0; i < remoteStoresWithLocalID.length; i++) {
				const remoteStore = remoteStores[i];
				const localID = remoteStoresWithLocalID[i].localID;
				const localStore = await userDB.stores.findOne(localID).exec();
				if (localStore && remoteStore.price_num_decimals != null) {
					await localStore.incrementalPatch({
						wc_price_decimals: remoteStore.price_num_decimals,
					});
				}
			}

			appLogger.debug('Upserted stores from response', {
				context: {
					storeIds: remoteStoresWithLocalID.map((store) => store.id),
					localIDs: remoteStoresWithLocalID.map((store) => store.localID),
				},
			});
		}

		// Update wpUser.stores with the new array of localIDs, excluding any docs
		// that failed to persist above.
		const newStoreLocalIDs = remoteStoresWithLocalID
			.map((store) => store.localID)
			.filter((localID) => !failedDocIds.has(localID));
		appLogger.debug('[stores] about to patch wpUser.stores', {
			context: {
				wpUserUuid: wpUser.uuid,
				newStoreLocalIDs,
				before: (wpUser as unknown as { stores?: string[] }).stores,
			},
		});
		await wpUser.incrementalPatch({
			stores: newStoreLocalIDs,
		});

		appLogger.debug('[stores] Successfully merged stores with response', {
			context: {
				totalRemoteStores: remoteStores.length,
				removedStores: storesToRemove.length,
				finalStoreCount: newStoreLocalIDs.length,
				wpUserStoresAfter: (wpUser.getLatest() as unknown as { stores?: string[] }).stores,
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
