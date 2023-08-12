// Helper function to get or insert a site
export const getOrInsertSite = async (userDB, site) => {
	let savedSite = await userDB.sites.findOneFix(site.uuid).exec();
	if (!savedSite) {
		savedSite = await userDB.sites.insert(site);
	}
	return savedSite;
};

// Helper function to get or insert wp_credentials
export const getOrInsertWPCredentials = async (userDB, wp_credentials) => {
	let savedCredentials = await userDB.wp_credentials.findOneFix(wp_credentials.uuid).exec();
	if (savedCredentials && savedCredentials.jwt !== wp_credentials.jwt) {
		// always update if jwt has changed
		await savedCredentials.patch({ jwt: wp_credentials.jwt });
	} else if (!savedCredentials) {
		savedCredentials = await userDB.wp_credentials.insert(wp_credentials);
	}
	return savedCredentials;
};

// Helper function to get or insert a store
export const getOrInsertStore = async (userDB, wpCredentials, stores, store_id) => {
	if (wpCredentials) {
		let savedStores = await wpCredentials.populate('stores');

		// Are there new store from the server?
		const newStores = stores.filter((s) => {
			return !savedStores.find((ss) => ss.id === parseInt(s.id, 10));
		});

		// Are there stale stores in the local db?
		const staleStores = savedStores.filter((ss) => {
			return !stores.find((s) => ss.id === parseInt(s.id, 10));
		});

		// Remove stale stores
		for (const staleStore of staleStores) {
			await staleStore.remove();
		}

		// Remove stale stores from the savedStores array
		savedStores = savedStores.filter((ss) => !staleStores.includes(ss));

		if (newStores.length > 0) {
			const { success: newStoreDocs } = await userDB.stores.bulkInsert(newStores);
			savedStores.push(...newStoreDocs);
		}

		// Update wpCredentials with the localIDs of the updated savedStores
		wpCredentials.incrementalPatch({ stores: savedStores.map((s) => s.localID) });

		const foundStore = savedStores.find((s) => s.id === parseInt(store_id, 10));
		if (foundStore) {
			return foundStore;
		} else if (savedStores.length > 0) {
			return savedStores[0];
		} else {
			throw new Error('No stores found in savedStores');
		}
	}
	return null;
};
