import difference from 'lodash/difference';
import unset from 'lodash/unset';
import { wrappedValidateStorageFactory } from 'rxdb';
import ZSchema from 'z-schema';

import log from '@wcpos/utils/src/logger';

import type { RxJsonSchema } from 'rxdb';

/**
 * Without a validator, rxdb will save any properties to the database
 */
function pruneProperties(obj: any, schema: RxJsonSchema<any>) {
	const topLevelFields = Object.keys(schema.properties);
	const omitProperties = difference(Object.keys(obj), topLevelFields);
	if (omitProperties.length > 0) {
		log.debug('the following properties are being omitted', omitProperties);
		omitProperties.forEach((prop: string) => {
			unset(obj, prop);
		});
	}
}

/**
 *
 */
export function getValidator(schema: RxJsonSchema<any>) {
	const validatorInstance = new (ZSchema as any)();

	const validator = (obj: any) => {
		pruneProperties(obj, schema);
		validatorInstance.validate(obj, schema);
		return validatorInstance;
	};

	return (docData: any) => {
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
			debugger;
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
