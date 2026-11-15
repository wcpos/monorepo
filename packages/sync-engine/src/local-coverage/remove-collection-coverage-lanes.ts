import { assertBulkSuccess } from '@wcpos/sync-core';

import { findAllUncached } from '../collections/find-all-uncached';

/**
 * Removes every coverage lane of one collection. A lane claims its records are local; once the
 * collection's local records are wiped (Clear & Sync, an F8 journal reset) no claim stands.
 */
export async function removeCollectionCoverageLanes(
	coverageLanes: {
		find(query?: object): { exec(): Promise<{ primary: string }[]> };
		bulkRemove(ids: string[]): Promise<unknown>;
	},
	collection: string
): Promise<void> {
	const laneDocs = await findAllUncached(coverageLanes, {
		selector: { collectionName: collection },
	});
	if (laneDocs.length > 0)
		assertBulkSuccess(
			await coverageLanes.bulkRemove(laneDocs.map((doc) => doc.primary)),
			'remove-collection-coverage-lanes remove'
		);
}
