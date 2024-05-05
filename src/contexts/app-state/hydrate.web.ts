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
	console.log('generateHashId', dataObject);

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
	const siteDoc = await userDB.sites.upsert(initialProps.site);
	const wpCredentialsDoc = await userDB.wp_credentials.upsert(initialProps.wp_credentials);

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
			return {
				...store,
				localID,
			};
		})
	);

	/**
	 * TODO - check date_modified_gmt and only update if newer
	 */
	const { success: storeDocs } = await userDB.stores.bulkUpsert(stores);
	await wpCredentialsDoc.patch({
		stores: storeDocs.map((store) => store.localID),
	});

	await appState.set('current', () => ({
		siteID: siteDoc.uuid,
		wpCredentialsID: wpCredentialsDoc.uuid,
		storeID: storeDocs[0].localID,
	}));
};
