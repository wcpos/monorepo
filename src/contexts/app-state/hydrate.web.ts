import * as Crypto from 'expo-crypto';

interface Props {
	userDB: import('@wcpos/database').UserDatabase;
	appState: any;
	user: any;
	initialProps: any;
}

export const isWebApp = true;

/**
 * Generate a unique id for stores
 */
async function generateHashId(dataObject) {
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
 *
 */
export const hydrateInitialProps = async ({ userDB, appState, user, initialProps }: Props) => {
	if (!initialProps) {
		throw new Error('No initialProps found');
	}
	const oldState = await appState.get('current');
	const siteDoc = await userDB.sites.upsert(initialProps.site);
	const wpCredentialsDoc = await userDB.wp_credentials.upsert(initialProps.wp_credentials);

	/**
	 * If ?store=number is the in the URL use that as the initial store,
	 * also, remove it from the URL so that it doesn't get used again.
	 */
	const urlParams = new URLSearchParams(window.location.search);
	const initialStoreID = parseInt(urlParams.get('store'), 10);
	if (initialStoreID) {
		urlParams.delete('store');
		window.history.replaceState({}, '', `${window.location.pathname}?${urlParams}`);
	}

	let storeID;

	/**
	 * Generate a unique id for each store
	 */
	const stores = await Promise.all(
		initialProps.stores.map(async (store) => {
			const localID = await generateHashId({
				user: user.uuid,
				siteID: siteDoc.uuid,
				wpCredentialsID: wpCredentialsDoc.uuid,
				storeID: store.id,
			});
			if (initialStoreID === store.id) {
				storeID = localID;
			}
			return {
				...store,
				localID,
			};
		})
	);
	const storeLocalIDs = stores.map((store) => store.localID);

	/**
	 *
	 */
	if (!storeID && oldState?.storeID && storeLocalIDs.includes(oldState?.storeID)) {
		storeID = oldState.storeID;
	} else {
		storeID = stores[0].localID; // default to first store?
	}

	/**
	 * @TODO - how to handle conflicts between remote and local store settings?
	 * - what is the date_modified_gmt for default store (ID:0)
	 */
	await userDB.stores.bulkInsert(stores); // will not overwrite existing data
	await wpCredentialsDoc.patch({
		stores: storeLocalIDs,
	});

	const newState = {
		siteID: siteDoc.uuid,
		wpCredentialsID: wpCredentialsDoc.uuid,
		storeID,
	};

	if (JSON.stringify(oldState) !== JSON.stringify(newState)) {
		await appState.set('current', () => newState);
	}
};
