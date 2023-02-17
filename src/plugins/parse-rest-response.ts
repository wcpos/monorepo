import difference from 'lodash/difference';
import isPlainObject from 'lodash/isPlainObject';
import unset from 'lodash/unset';

import log from '@wcpos/utils/src/logger';

import { getMetaUUID } from './generate-id';

import type { RxCollection, RxJsonSchema, RxPlugin } from 'rxdb';

/**
 *
 */
export function pruneProperties(schema: RxJsonSchema<any>, json: Record<string, any>) {
	/**
	 * TODO - WC REST API returns _links, which is forbidden by rxdb
	 * Not sure whether to swap _links -> links here or on the serverside PHP
	 */
	if (json._links) {
		json.links = json._links;
		unset(json, '_links');
	}

	/**
	 * There are some properties in the data that are really not needed, such as payment gateway properties
	 */
	const topLevelFields = Object.keys(schema.properties);
	const omitProperties = difference(Object.keys(json), topLevelFields);
	if (omitProperties.length > 0) {
		log.debug('the following properties are being omitted', omitProperties);
		omitProperties.forEach((prop: string) => {
			unset(json, prop);
		});
	}
}

/**
 *
 */
export function coerceData(
	schema: RxJsonSchema<any>,
	json: Record<string, any>,
	collection?: RxCollection
) {
	function traverse(
		schema: RxJsonSchema<any>,
		data: Record<string, any>,
		parentSchema: RxJsonSchema<any> | null = null
	): Record<string, any> {
		/**
		 * JSON nodes
		 */
		if (schema.type === 'object') {
			const coercedData = {};
			for (const prop in schema.properties) {
				/** Special case for rxdb internals */
				if (prop.startsWith('_')) continue;

				/** Special case for extracting uuid from meta_data */
				if (prop === 'uuid' && Array.isArray(json.meta_data)) {
					const uuidMeta = json.meta_data.find((meta) => meta.key === '_woocommerce_pos_uuid');
					if (uuidMeta) coercedData['uuid'] = uuidMeta.value;
					continue;
				}

				if (data.hasOwnProperty(prop)) {
					coercedData[prop] = traverse(schema.properties[prop], data[prop], schema);
				} else if (schema.properties[prop].hasOwnProperty('default')) {
					coercedData[prop] = schema.properties[prop].default;
				}
			}
			return coercedData;
		}
		if (schema.type === 'array') {
			const coercedData = [];
			for (let i = 0; i < data.length; i++) {
				coercedData.push(traverse(schema.items, data[i], schema));
			}
			return coercedData;
		}

		/**
		 * Primitive types
		 */
		if (schema.type === 'number' || schema.type === 'integer') {
			return Number(data);
		}
		if (schema.type === 'string') {
			/** NOTE - Special case for ref collections */
			if (collection && parentSchema && parentSchema.ref) {
				const refCollection = collection.database.collections[parentSchema.ref];
				return coerceData(refCollection.schema.jsonSchema, data, refCollection);
			}
			return String(data || '');
		}
		if (schema.type === 'boolean') {
			/** TODO - perhaps shouldn't do this, effective makes default false? */
			return typeof data === 'string' ? data === 'true' : Boolean(data);
		}
		if (schema.type === 'null') {
			return null;
		}
		return data;
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
	if (isPlainObject(json)) {
		pruneProperties(schema, json); // mutates json
		return coerceData(schema, json, collection); // return json
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
