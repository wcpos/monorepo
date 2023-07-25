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

/**
 *
 */
export function stringifyWithSortedKeys(obj: any): string {
	if (obj !== null && typeof obj === 'object') {
		const sortedKeys = Object.keys(obj).sort();
		return `{${sortedKeys
			.map((key) => `"${key}":${stringifyWithSortedKeys(obj[key])}`)
			.join(',')}}`;
	}
	return JSON.stringify(obj);
}
