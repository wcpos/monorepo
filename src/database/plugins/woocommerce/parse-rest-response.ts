import forEach from 'lodash/forEach';
import get from 'lodash/get';
import set from 'lodash/set';
import unset from 'lodash/unset';
import difference from 'lodash/difference';

type RxCollection = import('rxdb/dist/types').RxCollection;

/**
 * Parse plain data helper
 * Converts properties to camelCase and strips out any properties not in the schema
 *
 * @param plainData
 * @param collection
 */
export function parseRestResponse(this: RxCollection, plainData: Record<string, unknown>) {
	const topLevelFields = get(this, 'schema.topLevelFields');

	// need to convert localID to string
	plainData._id = String(plainData.id);
	plainData._deleted = false;
	plainData.links = plainData._links || {};
	unset(plainData, '_links');
	// TODO convert _link to link propert??

	/**
	 * @TODO - change this to a validator 
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
	if (Array.isArray(plainData.metaData)) {
		forEach(plainData.metaData, (meta) => {
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
		console.log('the following properties are being omitted', omitProperties);
		omitProperties.forEach((prop: string) => {
			unset(plainData, prop);
		});
	}

	return plainData;
}
