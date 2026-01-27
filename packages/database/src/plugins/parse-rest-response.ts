import cloneDeep from 'lodash/cloneDeep';
import difference from 'lodash/difference';
import isPlainObject from 'lodash/isPlainObject';
import unset from 'lodash/unset';

import { getLogger } from '@wcpos/utils/logger';

import type { RxCollection, RxJsonSchema, RxPlugin } from 'rxdb';

const dbLogger = getLogger(['wcpos', 'db', 'parse']);

type ExtendedRxJsonSchema<T> = RxJsonSchema<T> & {
	ref?: string;
	items?: RxJsonSchema<any>;
	default?: any;
};

/**
 * Returns a type-safe default value based on the schema type.
 * Used when a property is missing from incoming data and has no schema default.
 */
export function getDefaultForType(schema: ExtendedRxJsonSchema<any>): any {
	switch (schema.type) {
		case 'string':
			return '';
		case 'number':
		case 'integer':
			return 0;
		case 'boolean':
			return false;
		case 'array':
			return [];
		case 'object':
			return {};
		case 'null':
			return null;
		default:
			return undefined;
	}
}

/**
 *
 */
export function pruneProperties(schema: ExtendedRxJsonSchema<any>, json: Record<string, any>) {
	/**
	 * TODO - WC REST API returns _links, which is forbidden by rxdb
	 * Not sure whether to swap _links -> links here or on the serverside PHP
	 */
	if (json._links) {
		json.links = json._links;
		unset(json, '_links');
	}

	/**
	 * BUGFIX: I just saw a product that has 1800+ meta_data entries with the key '_alg_wc_cog_cost_archive'
	 * all objects as value, when the WC REST API says to expect a string - FFS.
	 *
	 * Order line items need to have meta data, but probably not private meta data
	 *
	 * Temporary remove any meta data with key starting with '_' except meta_data beginning with::
	 * - _woocommerce_pos
	 * - _pos
	 */
	if (Array.isArray(json.meta_data)) {
		const whitelist = ['_woocommerce_pos', '_pos'];

		json.meta_data = json.meta_data.filter((meta: any) => {
			if (meta.key.startsWith('_') && !whitelist.some((prefix) => meta.key.startsWith(prefix))) {
				return false;
			}
			return true;
		});
	}

	/**
	 * There are some properties in the data that are really not needed, such as payment gateway properties
	 */
	const topLevelFields = Object.keys(schema.properties);
	const omitProperties = difference(Object.keys(json), topLevelFields);
	if (omitProperties.length > 0) {
		dbLogger.debug('the following properties are being omitted', { context: { omitProperties } });
		omitProperties.forEach((prop: string) => {
			unset(json, prop);
		});
	}
}

/**
 *
 */
function coercePrimitiveTypes(
	schema: ExtendedRxJsonSchema<any>,
	data: any,
	collection?: RxCollection,
	parentSchema?: ExtendedRxJsonSchema<any> | null
): any {
	switch (schema.type) {
		case 'number':
		case 'integer':
			return Number(data);
		case 'string':
			/** NOTE - Special case for ref collections */
			if (collection && parentSchema && parentSchema.ref) {
				const refCollection = collection.database.collections[parentSchema.ref];
				return coerceData(refCollection.schema.jsonSchema, data, refCollection);
			}
			if (isPlainObject(data)) {
				return JSON.stringify(data);
			}
			return String(data || '');
		case 'boolean':
			return typeof data === 'string' ? data === 'true' : Boolean(data);
		case 'null':
			return null;
		default:
			return data;
	}
}

/**
 *
 */
export function coerceData(
	schema: ExtendedRxJsonSchema<any>,
	json: Record<string, any>,
	collection?: RxCollection
) {
	function traverse(
		schema: ExtendedRxJsonSchema<any>,
		data: Record<string, any>,
		parentSchema: ExtendedRxJsonSchema<any> | null = null
	): Record<string, any> {
		/**
		 * JSON nodes
		 */
		if (schema.type === 'object') {
			const coercedData: Record<string, any> = {};
			// Ensure data is at least an empty object for safe property access
			const safeData = data != null && typeof data === 'object' ? data : {};

			for (const prop in schema.properties) {
				/** Special case for rxdb internals */
				if (prop.startsWith('_')) continue;

				const propSchema = schema.properties[prop] as ExtendedRxJsonSchema<any>;

				/** Special case for extracting uuid from meta_data */
				if (prop === 'uuid' && Array.isArray(json.meta_data)) {
					const uuidMeta = json.meta_data.find((meta) => meta.key === '_woocommerce_pos_uuid');
					if (uuidMeta) coercedData['uuid'] = uuidMeta.value;
					continue;
				}

				if (Object.prototype.hasOwnProperty.call(safeData, prop)) {
					coercedData[prop] = traverse(propSchema, safeData[prop], schema);
				} else if (Object.prototype.hasOwnProperty.call(propSchema, 'default')) {
					coercedData[prop] = cloneDeep(propSchema.default);
				} else {
					// Type-safe fallback: provide a default based on schema type
					coercedData[prop] = getDefaultForType(propSchema);
				}
			}
			return coercedData;
		}
		if (schema.type === 'array') {
			const coercedData = [];
			if (Array.isArray(data)) {
				for (let i = 0; i < data.length; i++) {
					if (schema.items) {
						coercedData.push(traverse(schema.items, data[i], schema));
					}
				}
			}
			return coercedData;
		}

		// Primitive types handling
		return coercePrimitiveTypes(schema, data, collection, parentSchema);
	}

	return traverse(schema, json);
}

/**
 * NOTE - this mutates original json
 * update this to return a new object?
 */
export function parseRestResponse(this: RxCollection, json: Record<string, any>) {
	const collection = this;
	const schema = collection.schema.jsonSchema;
	// NOTE: in the audit we sometimes set _deleted to true, we don't want to prune/coerce that
	if (isPlainObject(json) && json._deleted !== true) {
		pruneProperties(schema, json); // mutates json
		return coerceData(schema, json, collection);
	}
	return json;
}

/**
 *
 */
const parseRestResponsePlugin: RxPlugin = {
	name: 'parse-rest-response',
	rxdb: true,

	/**
	 * every value in this object can manipulate the prototype of the keynames class
	 * You can manipulate every prototype in this list:
	 * @link https://github.com/pubkey/rxdb/blob/master/src/plugin.ts#L22
	 */
	prototypes: {
		RxCollection: (proto: any) => {
			proto.parseRestResponse = parseRestResponse;
		},
	},

	/**
	 * some methods are static and can be overwritten in the overwriteable-object
	 */
	overwritable: {},

	/**
	 * you can add hooks to the hook-list
	 * https://github.com/pubkey/rxdb/blob/master/src/hooks.ts
	 */
	hooks: {},
};

export default parseRestResponsePlugin;
