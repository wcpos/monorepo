/**
 * NOTE: make sure it is sorted by date_modified_gmt, this is important
 */
export const getlocalDocsWithIDs = async (collection, endpoint = '') => {
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
