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
export function requestIdleCallbackIfAvailable(fun: Function): void {
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

/**
 * returns the parsed validator from ajv
 */
export function _getValidator(rxSchema: RxSchema): any {
	const { hash } = rxSchema;
	if (!VALIDATOR_CACHE.has(hash)) {
		const validator = ajv.compile(rxSchema.jsonSchema);
		VALIDATOR_CACHE.set(hash, validator);
	}
	return VALIDATOR_CACHE.get(hash);
}

/**
 * validates the given object against the schema
 */
function validate(this: RxSchema, obj: any) {
	const useValidator = _getValidator(this);
	const isValid = useValidator(obj);

	if (isValid) return obj;

	throw new Error('VD2', {
		errors: useValidator.errors,
		obj,
		schema: this.jsonSchema,
	});
}

const runAfterSchemaCreated = (rxSchema: RxSchema) => {
	// pre-generate validator-function from the schema
	requestIdleCallbackIfAvailable(() => _getValidator(rxSchema));
};

export const rxdb = true;
export const prototypes = {
	/**
	 * set validate-function for the RxSchema.prototype
	 */
	RxSchema: (proto: any) => {
		proto.validate = validate;
	},
};
export const hooks = {
	createRxSchema: runAfterSchemaCreated,
};

export const RxDBAjvValidatePlugin: RxPlugin = {
	name: 'ajv-validate',
	rxdb,
	prototypes,
	hooks,
};
