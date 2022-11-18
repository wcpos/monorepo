/**
 * this plugin validates documents before they can be inserted into the RxCollection.
 * It's using ajv as jsonschema-validator
 * @link https://github.com/epoberezkin/ajv
 */
import Ajv from 'ajv';
import { wrappedValidateStorageFactory } from 'rxdb';

import addFormats from './ajv-formats';

import type { RxDocumentData, RxJsonSchema } from 'rxdb';

// const ajv = new Ajv({
// 	strict: false,
// });

const ajv = new Ajv({ strict: 'log', coerceTypes: true });
ajv.addVocabulary([
	'version',
	'primaryKey',
	'indexes',
	'encrypted',
	'enumNames',
	'keyCompression',
	'sharding',
]);
// const ignoredKeys = ['_attachments', '_meta', '_rev'];

/**
 * Duck punch the WC REST schema for children
 * - rxdb won't allow this type of schema (at the moment)
 */
ajv.addKeyword({
	keyword: 'ref',
	code(cxt) {
		cxt.parentSchema = {
			...cxt.parentSchema,
			items: {
				oneOf: [{ type: 'string' }, { type: 'object' }],
			},
		};
		Object.freeze(cxt.parentSchema);
	},
});

/**
 * Add formats to ajv
 */
addFormats(ajv);

export function getValidator(schema: RxJsonSchema<any>) {
	const validator = ajv.compile(schema);

	return (docData: RxDocumentData<any>) => {
		const isValid = validator(docData);

		if (!isValid) {
			console.warn('validation', validator.errors);
		}

		return docData;
	};
}

export const wrappedValidateAjvStorage = wrappedValidateStorageFactory(getValidator, 'ajv');
