type QueryState = import('./').QueryState;

/**
 * Recursively removes all properties with `null` values from an object.
 * Modifies the input object directly.
 */
export function removeNulls(obj: any): QueryState {
	for (const prop in obj) {
		if (obj[prop] === null) {
			delete obj[prop];
		} else if (typeof obj[prop] === 'object') {
			obj[prop] = removeNulls(obj[prop]);
		}
	}
	return obj as QueryState;
}
