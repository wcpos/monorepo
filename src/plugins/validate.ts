/**
 * this plugin validates documents before they can be inserted into the RxCollection.
 * It's using ajv as jsonschema-validator
 * @link https://github.com/epoberezkin/ajv
 */
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import type { RxPlugin } from 'rxdb';
import { RxSchema } from 'rxdb';

/**
 * run the callback if requestIdleCallback available
 * do nothing if not
 * @link https://developer.mozilla.org/de/docs/Web/API/Window/requestIdleCallback
 */
export function requestIdleCallbackIfAvailable(fun: (arg: IdleDeadline) => void): void {
	if (typeof window === 'object' && (window as any).requestIdleCallback)
		(window as any).requestIdleCallback(fun);
}

/**
 * cache the validators by the schema-hash
 * so we can reuse them when multiple collections have the same schema
 */
const VALIDATOR_CACHE: Map<string, any> = new Map();

const ajv = new Ajv({ strict: 'log', coerceTypes: true });
addFormats(ajv);
ajv.addVocabulary(['version', 'primaryKey', 'indexes', 'encrypted', 'enumNames', 'keyCompression']);

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
 * returns the parsed validator from ajv
 */
export function getValidator(rxSchema: RxSchema): any {
	const { hash } = rxSchema;
	if (!VALIDATOR_CACHE.has(hash)) {
		const validator = ajv.compile(rxSchema.jsonSchema);
		VALIDATOR_CACHE.set(hash, validator);
	}
	return VALIDATOR_CACHE.get(hash);
}

/**
 * validates the given object against the schema
 * @param  schemaPath if given, the sub-schema will be validated
 * @throws {RxError} if not valid
 */
function validateFullDocumentData(this: RxSchema, obj: any): any {
	const validator = getValidator(this);
	const isValid = validator(obj);

	if (isValid) return obj;

	console.error(validator.errors);
	throw new Error(validator.errors);
}

const runAfterSchemaCreated = (rxSchema: RxSchema) => {
	// pre-generate the isMyJsonValid-validator from the schema
	requestIdleCallbackIfAvailable(() => {
		getValidator(rxSchema);
	});
};

export const RxDBAjvValidatePlugin: RxPlugin = {
	name: 'validate',
	rxdb: true,
	prototypes: {
		/**
		 * set validate-function for the RxSchema.prototype
		 * @param prototype of RxSchema
		 */
		RxSchema: (proto: any) => {
			proto._getValidator = getValidator;
			proto.validateFullDocumentData = validateFullDocumentData;
		},
	},
	hooks: {
		createRxSchema: {
			after: runAfterSchemaCreated,
		},
		/**
		 * @TODO - remove this hack!!
		 * https://github.com/pubkey/rxdb/issues/3878
		 */
		createRxCollection: {
			after({ collection }) {
				collection.preInsert(function (data) {
					Object.assign(data, collection.schema.validate(data));
					return data;
				}, true);
				collection.preSave(function (data) {
					Object.assign(data, collection.schema.validate(data));
					return data;
				}, true);
			},
		},
	},
};
