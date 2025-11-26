import snakeCase from 'lodash/snakeCase';
import { stringify } from 'query-string';

import log from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

/**
 * @NOTE - query-string is part of the `react-navigation` package, if I install a newer version of that package,
 * it breaks `react-navigation` :(
 */

/**
 * Helper to classify and log errors from the query package
 */
export const logError = (error: any, defaultMessage: string = 'An error occurred') => {
	let errorCode = error?.errorCode;
	const isHttpError =
		error && (error.response || error.request || error.isAxiosError || error.config);

	if (!errorCode) {
		if (isHttpError) {
			// If it's an HTTP error without a specific code, use a generic connection error
			errorCode = ERROR_CODES.CONNECTION_REFUSED;
		} else if (error?.message?.includes('SQL')) {
			errorCode = ERROR_CODES.QUERY_SYNTAX_ERROR;
		} else {
			errorCode = ERROR_CODES.SERVICE_UNAVAILABLE;
		}
	}

	const message = error?.message || defaultMessage;

	log.error(message, {
		showToast: true,
		saveToDb: true,
		context: {
			errorCode,
			error: error instanceof Error ? error.message : String(error),
			isHttpError,
		},
	});
};

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
	const queryString = stringify(params, { arrayFormat: 'bracket', skipNull: true });
	return endpoint + (queryString ? `?${queryString}` : '');
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

/**
 *
 */
export function toUpperSnakeCase(str: string): string {
	return snakeCase(str).toUpperCase();
}

/**
 *
 */
export function getParamValueFromEndpoint(endpoint: string, param: string) {
	const url = new URL(endpoint, 'http://dummy.com');
	const params = new URLSearchParams(url.search);
	return params.get(param);
}

/**
 *
 */
type WhereClause = { field: string; value: any };
export function normalizeWhereClauses(clauses: WhereClause[]): WhereClause[] {
	const fieldMap = new Map<string, WhereClause>();
	const fieldsToRemove = new Set<string>();

	for (const clause of clauses) {
		if (clause.value === null) {
			// Mark the field for removal
			fieldsToRemove.add(clause.field);
			fieldMap.delete(clause.field);
		} else if (clause.value?.$elemMatch) {
			const key = `${clause.field}_${clause.value.$elemMatch.key || clause.value.$elemMatch.name}`;
			if (clause.value.$elemMatch.value === null || clause.value.$elemMatch.option === null) {
				fieldMap.delete(key);
			} else {
				fieldMap.set(key, clause);
			}
		} else if (!fieldsToRemove.has(clause.field)) {
			fieldMap.set(clause.field, clause);
		}
	}

	// Ensure fields marked for removal are not in the final output
	fieldsToRemove.forEach((field) => {
		for (const key of fieldMap.keys()) {
			if (key.startsWith(field)) {
				fieldMap.delete(key);
			}
		}
	});

	return Array.from(fieldMap.values());
}
