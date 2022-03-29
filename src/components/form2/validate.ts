import type { ErrorSchema } from './types';

/**
 *
 * @param errorSchema
 * @param fieldName
 * @returns
 */
export function toErrorList(errorSchema: ErrorSchema, fieldName = 'root') {
	// XXX: We should transform fieldName as a full field path string.
	let errorList = [];
	if ('__errors' in errorSchema) {
		errorList = errorList.concat(
			errorSchema.__errors.map((stack) => {
				return {
					stack: `${fieldName}: ${stack}`,
				};
			})
		);
	}
	return Object.keys(errorSchema).reduce((acc, key) => {
		if (key !== '__errors') {
			acc = acc.concat(toErrorList(errorSchema[key], key));
		}
		return acc;
	}, errorList);
}
