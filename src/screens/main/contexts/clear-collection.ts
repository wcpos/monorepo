import { RxCollection } from 'rxdb';

import { addStoreDBCollection } from '@wcpos/database';
import log from '@wcpos/utils/src/logger';

/**
 * This is a bit of a hack
 * I can't seem to remove a collection cleanly from the database
 * If I try twice I can get it to remove and then add again
 *
 * It's possible this is a problem with indexedDB? web workers?
 * I have to write some tests for rxdb to see if I can replicate the issue
 */
async function removeWithTimeout(
	collection: RxCollection,
	retryTimeout: number,
	maxRetries: number
) {
	let retries = 0;

	while (retries < maxRetries) {
		try {
			// Race between the destroy() function and a timeout promise
			collection.destroyed = false;
			const result = await Promise.race([
				collection.remove(),
				new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), retryTimeout)),
			]);

			// If destroy() resolved before the timeout, return the result
			return result;
		} catch (error) {
			if (error.message === 'Timeout') {
				console.warn(`Attempt ${retries + 1} timed out, retrying...`);
				retries++;
			} else {
				// If an error other than timeout occurs, throw the error
				throw error;
			}
		}
	}

	throw new Error(`Failed after ${maxRetries} attempts`);
}

/**
 *
 */
async function clearCollection(storeID: string, collection: RxCollection) {
	try {
		await removeWithTimeout(collection, 200, 5);
	} catch (error) {
		log.error(error);
	}

	return addStoreDBCollection(storeID, 'customers');
}

export default clearCollection;
