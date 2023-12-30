/**
 *
 * @param value
 * @returns
 */
export function isArrayOfIntegers(value) {
	return Array.isArray(value) && value.every((item) => Number.isInteger(item));
}

/**
 * eg: customers?orderby=last_name&order=asc&per_page=10&role=all
 */
export function buildEndpointWithParams(endpoint: string, params: Record<string, any>) {
	const url = new URL(endpoint, 'http://dummybase'); // Dummy base, actual base URL is in httpClient
	Object.keys(params).forEach((key) => {
		if (params[key] !== undefined && params[key] !== null) {
			url.searchParams.append(key, params[key]);
		}
	});
	return url.pathname.slice(1) + url.search;
}

/**
 *
 * @param schema
 * @param path
 * @returns
 */
function getType(schema: any, path: string[]): string {
	const [head, ...tail] = path;
	if (tail.length === 0) {
		return schema[head].type;
	}
	return getType(schema[head].properties, tail);
}

/**
 *
 * @param schema
 * @param fields
 * @returns
 */
export function buildSchema(schema: any, fields: string[]): any {
	const outputSchema: any = {};

	fields.forEach((field) => {
		const keys = field.split('.');
		const type = getType(schema, keys);

		let target = outputSchema;
		keys.forEach((key, index) => {
			if (index === keys.length - 1) {
				target[key] = type;
			} else {
				target[key] = target[key] || {};
			}
			target = target[key];
		});
	});

	return outputSchema;
}

type NestedObject = { [key: string]: any };

/**
 *
 * @param obj
 * @param keys
 * @returns
 */
export const pluckProperties = (obj: NestedObject, keys: string[]): NestedObject => {
	const result: NestedObject = {};

	keys.forEach((key) => {
		const parts = key.split('.');
		let subObj = obj;
		let target = result;

		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];

			if (i === parts.length - 1) {
				target[part] = subObj[part];
			} else {
				target[part] = target[part] || {};
				target = target[part];
			}

			if (subObj) {
				subObj = subObj[part];
			}
		}
	});

	return result;
};
