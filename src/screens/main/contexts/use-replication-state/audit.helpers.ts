/**
 * NOTE: make sure it is sorted by date_modified_gmt, this is important
 */
export const getlocalDocsWithIDsOrderedByLastModified = async (collection, endpoint = '') => {
	// special case for variations
	const regex = /^products\/(\d+)\/variations/;
	const match = endpoint.match(regex);
	await collection.database.requestIdlePromise();

	if (match) {
		const parentID = parseInt(match[1], 10);
		const parentDocs = await collection.database.collections.products
			.find({ selector: { id: parentID } })
			.exec();
		if (Array.isArray(parentDocs) && parentDocs.length === 1) {
			const { variations } = parentDocs[0];
			return collection
				.find({
					selector: { id: { $in: variations } },
					sort: [{ date_modified_gmt: 'desc' }],
				})
				.exec();
		} else {
			return Promise.resolve([]);
		}
	} else {
		return collection
			.find({
				selector: { id: { $exists: true } },
				sort: [{ date_modified_gmt: 'desc' }],
			})
			.exec();
	}
};

/**
 *
 */
export const getAndPatchRecentlyModified = async (modified_after, collection, endpoint, http) => {
	const response = await http.get(endpoint, {
		params: { modified_after },
	});

	if (Array.isArray(response?.data)) {
		await Promise.all(
			response.data.map(async (doc) => {
				const parsedData = collection.parseRestResponse(doc);
				await collection.upsertRefs(parsedData); // upsertRefs mutates the parsedData
				/**
				 * This is a complete hack, but rxdb won't update these docs??!!
				 * I will fetch them, then incrementPatch them :(
				 */
				const localDoc = await collection.findOne(parsedData.uuid).exec();
				if (localDoc) {
					await localDoc.incrementalPatch(parsedData);
				} else {
					await collection.insert(parsedData);
				}
			})
		);
	}
};
