import difference from 'lodash/difference';
import unset from 'lodash/unset';
import { wrappedValidateStorageFactory } from 'rxdb';
import ZSchema from 'z-schema';

import log from '@wcpos/utils/src/logger';

import type { RxJsonSchema } from 'rxdb';

/**
 * Without a validator, rxdb will save any properties to the database
 */
function pruneProperties(schema: RxJsonSchema<any>, data: any) {
	const topLevelFields = Object.keys(schema.properties);
	const omitProperties = difference(Object.keys(data), topLevelFields);
	if (omitProperties.length > 0) {
		log.debug('the following properties are being omitted', omitProperties);
		omitProperties.forEach((prop: string) => {
			unset(data, prop);
		});
	}
}

/**
 *
 */
function coerceData(schema, data) {
	// Recursive function that goes through the schema and data and coerces the data to match the schema
	function traverse(schema, data) {
		// Check if the current schema is an object
		if (schema.type === 'object') {
			// Iterate through the properties of the schema
			for (const prop in schema.properties) {
				if (prop.startsWith('_')) continue;
				// Check if the data has the current property
				if (data.hasOwnProperty(prop)) {
					// Recursively traverse the schema and data for the current property
					data[prop] = traverse(schema.properties[prop], data[prop]);
				} else if (schema.properties[prop].hasOwnProperty('default')) {
					data[prop] = schema.properties[prop].default;
				}
			}
			return;
		}
		// Check if the current schema is an array
		// if (schema.type === 'array') {
		// 	// Iterate through the data
		// 	for (let i = 0; i < data.length; i++) {
		// 		// Recursively traverse the schema and data for the current element
		// 		traverse(schema.items, data[i]);
		// 	}
		// 	return;
		// }
		// Check if the current schema is a number
		if (schema.type === 'number') {
			// Coerce the data to a number
			return Number(data);
		}
		// Check if the current schema is a string
		if (schema.type === 'string') {
			// Coerce the data to a string
			return String(data);
		}
		// Check if the current schema is a boolean
		if (schema.type === 'boolean') {
			// Coerce the data to a boolean
			return Boolean(data);
		}
		// Check if the current schema is a null
		if (schema.type === 'null') {
			// Coerce the data to a null
			return null;
		}
		return data;
	}
	traverse(schema, data);
}

/**
 *
 */
export function getValidator(schema: RxJsonSchema<any>) {
	const validatorInstance = new (ZSchema as any)();

	const validator = (data: any) => {
		pruneProperties(schema, data);
		coerceData(schema, data);
		validatorInstance.validate(data, schema);
		return validatorInstance;
	};

	return (docData: any) => {
		if (schema.title === 'RxInternalDocument' || schema.title === 'RxLocalDocument') {
			return true;
		}
		const useValidator = validator(docData);
		if (useValidator === true) {
			return;
		}
		const errors: ZSchema.SchemaErrorDetail[] = (useValidator as any).getLastErrors();
		if (errors) {
			const formattedZSchemaErrors = (errors as any).map(
				({ title, description, message }: any) => ({
					title,
					description,
					message,
				})
			);
			log.error('z-schema validation failed', formattedZSchemaErrors);
			return formattedZSchemaErrors;
		} else {
			return [];
		}
	};
}

export const wrappedValidateZSchemaStorage = wrappedValidateStorageFactory(
	getValidator,
	'z-schema'
);
