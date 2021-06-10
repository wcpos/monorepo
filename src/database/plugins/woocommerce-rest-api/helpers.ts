import camelCase from 'lodash/camelCase';
import forEach from 'lodash/forEach';
import get from 'lodash/get';
import unset from 'lodash/unset';
import difference from 'lodash/difference';

type RxCollection = import('rxdb').RxCollection;

export const PLUGIN_IDENT = 'woocommercerestapisync';

// does nothing
export const DEFAULT_MODIFIER = (d: any) => Promise.resolve(d);

/**
 * Parse plain data helper
 * Converts properties to camelCase and strips out any properties not in the schema
 *
 * @param plainData
 * @param collection
 */
export function parsePlainData(this: RxCollection, plainData: Record<string, unknown>) {
	const topLevelFields = get(this, 'schema.topLevelFields');

	/**
	 * convert all plainData properties to camelCase
	 */
	forEach(plainData, (data, key) => {
		const privateProperties = ['_id', '_attachments', '_rev'];
		if (!privateProperties.includes(key) && key.includes('_')) {
			plainData[camelCase(key)] = data;
			unset(plainData, key);
		}
	});

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

/**
 *
 */
export function promiseWait(ms = 0): Promise<void> {
	return new Promise((res) => setTimeout(res, ms));
}

/**
 *
 */
export function wasRevisionfromPullReplication(endpointHash: string, revision: string) {
	const ending = endpointHash.substring(0, 8) + PLUGIN_IDENT;
	const ret = revision.endsWith(ending);
	return ret;
}
