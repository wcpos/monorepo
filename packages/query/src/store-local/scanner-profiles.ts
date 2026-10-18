import { firstValueFrom, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import type { ScannerProfileDocument } from '@wcpos/database';

import { StoreDatabaseUnavailableError } from '../commands/printer-profiles';
import { observeFollowedCollection } from '../use-local-collection';

import type { StoreLocalDatabase } from '../reads/store-local';
import type { RxCollection } from 'rxdb';

export type ScannerProfile = ReturnType<ScannerProfileDocument['toJSON']>;
export type ScannerConnectionType = ScannerProfile['connectionType'];

function profilesQuery(
	collection: RxCollection<ScannerProfile>,
	types?: readonly ScannerConnectionType[]
) {
	return types?.length
		? collection.find({
				selector: { connectionType: types.length === 1 ? types[0] : { $in: [...types] } },
			})
		: collection.find();
}

/** Store-local scanner identities as JSON rows, following collection recovery. */
export function observeScannerProfiles(
	storeDB: StoreLocalDatabase,
	types?: readonly ScannerConnectionType[]
) {
	return observeFollowedCollection<ScannerProfile>(storeDB, 'scanner_profiles').pipe(
		switchMap((collection) =>
			collection
				? profilesQuery(collection, types).$.pipe(map((docs) => docs.map((doc) => doc.toJSON())))
				: of([])
		)
	);
}

/** Resolve the current collection at call time, including after a store switch. */
export async function readScannerProfiles(
	storeDB: StoreLocalDatabase,
	types?: readonly ScannerConnectionType[]
): Promise<ScannerProfile[]> {
	const collection = await firstValueFrom(
		observeFollowedCollection<ScannerProfile>(storeDB, 'scanner_profiles')
	);
	const docs = collection ? await profilesQuery(collection, types).exec() : [];
	return docs.map((doc) => doc.toJSON());
}

function scannerProfiles(storeDB: StoreLocalDatabase) {
	const collection = storeDB?.collections.scanner_profiles as
		RxCollection<ScannerProfile> | undefined;
	if (!collection) throw new StoreDatabaseUnavailableError();
	return collection;
}

/** deviceKey is the primary key; the caller owns its transport-specific composition. */
export async function saveScannerProfile(
	storeDB: StoreLocalDatabase,
	profile: ScannerProfile
): Promise<void> {
	await scannerProfiles(storeDB).upsert(profile);
}

/** A second removal is a no-op, including when another press wins the delete race. */
export async function removeScannerProfile(
	storeDB: StoreLocalDatabase,
	deviceKey: string
): Promise<boolean> {
	const collection = scannerProfiles(storeDB);
	const doc = await collection.findOne(deviceKey).exec();
	if (!doc) return false;
	try {
		await doc.remove();
	} catch (error) {
		if (!(await collection.findOne(deviceKey).exec())) return false;
		throw error;
	}
	return true;
}
