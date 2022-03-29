import get from 'lodash/get';

type Schema = import('./types').Schema;

/**
 *
 */
export function isObject(thing: any) {
	if (typeof File !== 'undefined' && thing instanceof File) {
		return false;
	}
	return typeof thing === 'object' && thing !== null && !Array.isArray(thing);
}

/**
 *
 */
export function mergeObjects(
	obj1: Record<string, unknown>,
	obj2: Record<string, unknown>,
	concatArrays = false
) {
	// Recursively merge deeply nested objects.
	const acc = { ...obj1 }; // Prevent mutation of source object.
	return Object.keys(obj2).reduce((acc, key) => {
		const left = obj1 ? obj1[key] : {};
		const right = obj2[key];
		if (obj1 && obj1.hasOwnProperty(key) && isObject(right)) {
			acc[key] = mergeObjects(left, right, concatArrays);
		} else if (concatArrays && Array.isArray(left) && Array.isArray(right)) {
			acc[key] = left.concat(right);
		} else {
			acc[key] = right;
		}
		return acc;
	}, acc);
}

// In the case where we have to implicitly create a schema, it is useful to know what type to use
//  based on the data we are defining
export function guessType(value: any) {
	if (Array.isArray(value)) {
		return 'array';
	}
	if (typeof value === 'string') {
		return 'string';
	}
	if (value == null) {
		return 'null';
	}
	if (typeof value === 'boolean') {
		return 'boolean';
	}
	if (!Number.isNaN(value)) {
		return 'number';
	}
	if (typeof value === 'object') {
		return 'object';
	}
	// Default to string if we can't figure it out
	return 'string';
}

/**
 * Gets the type of a given schema.
 */
export function getSchemaType(schema: Schema) {
	const type = get(schema, 'type');

	if (!type && schema?.const) {
		return guessType(schema.const);
	}

	if (!type && schema?.enum) {
		return 'string';
	}

	if (!type && (schema?.properties || schema?.additionalProperties)) {
		return 'object';
	}

	if (type instanceof Array && type.length === 2 && type.includes('null')) {
		return type.find((t) => t !== 'null');
	}

	return type;
}

/**
 * This function checks if the given schema matches a single
 * constant value.
 */
export function isConstant(schema: Schema) {
	return (
		(Array.isArray(schema.enum) && schema.enum.length === 1) ||
		Object.prototype.hasOwnProperty.call(schema, 'const')
	);
}

/**
 *
 */
export function isSelect(schema: Schema, rootSchema?: Schema) {
	// const schema = retrieveSchema(_schema, rootSchema);
	const altSchemas = schema.oneOf || schema.anyOf;
	if (Array.isArray(schema.enum)) {
		return true;
	}
	if (Array.isArray(altSchemas)) {
		return altSchemas.every((altSchema) => isConstant(altSchema));
	}
	return false;
}

/**
 *
 */
export function optionsList(schema: Schema) {
	if (schema.enum) {
		return schema.enum.map((value, i) => {
			let label = String(value);
			if (schema.enumNames && schema.enumNames[i]) {
				label = schema.enumNames[i];
			}
			return { label, value };
		});
	}
	const altSchemas = schema.oneOf || schema.anyOf;
	return altSchemas.map((schema, i) => {
		const value = toConstant(schema);
		const label = schema.title || String(value);
		return {
			schema,
			label,
			value,
		};
	});
}
