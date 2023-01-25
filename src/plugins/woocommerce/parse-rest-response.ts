import difference from 'lodash/difference';
import forEach from 'lodash/forEach';
import get from 'lodash/get';
import set from 'lodash/set';
import unset from 'lodash/unset';

import log from '@wcpos/utils/src/logger';

type RxCollection = import('rxdb/dist/types').RxCollection;

/**
 * Parse plain data helper
 *
 * @param plainData
 * @param collection
 */
export function parseRestResponse(this: RxCollection, plainData: Record<string, unknown>) {
	const topLevelFields = Object.keys(get(this, ['schema', 'jsonSchema', 'properties'], {}));
	const primaryPath = get(this, ['schema', 'primaryPath'], '');
	log.debug('parseRestResponse', plainData);

	if (plainData._links) {
		plainData.links = plainData._links;
		unset(plainData, '_links');
	}

	if (plainData._deleted === undefined) {
		plainData._deleted = false; // @TODO - should I take care of this in validation, eg: default value?
	}

	/**
	 * @TODO - should I update created and modified dates??
	 */
	// if (topLevelFields.includes('date_created_gmt') && !plainData.date_created_gmt) {
	// 	const timestamp = Date.now();
	// 	const date_created_gmt = new Date(timestamp).toISOString().split('.')[0];
	// 	plainData.date_created_gmt = date_created_gmt;
	// }

	/**
	 * @TODO - change this to a validator?
	 * special fix for metaData values to make sure they are strings
	 * fixes bug where WC REST API customer endpoint for returns:
	 * {
			"id": 18,
			"key": "community-events-location",
			"value": {
				"ip": "XXX.XXX.XXX.XXX"
			}
		}
		*/
	if (Array.isArray(plainData.meta_data)) {
		forEach(plainData.meta_data, (meta) => {
			if (typeof meta.value === 'object' && meta.value !== null) {
				meta.value = JSON.stringify(meta.value);
			}
		});
	}

	/**
	 * remove any properties not in the schema
	 */
	const omitProperties = difference(Object.keys(plainData), topLevelFields);
	if (omitProperties.length > 0) {
		log.debug('the following properties are being omitted', omitProperties);
		omitProperties.forEach((prop: string) => {
			unset(plainData, prop);
		});
	}

	return plainData;
}

/**
 *
 */
export function bulkParseRestResponse(this: RxCollection, dataArray: Record<string, unknown>[]) {
	return dataArray.map((data) => parseRestResponse.call(this, data));
}
