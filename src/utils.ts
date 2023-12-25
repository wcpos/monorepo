/**
 *
 * @param value
 * @returns
 */
export function isArrayOfIntegers(value) {
	return Array.isArray(value) && value.every((item) => Number.isInteger(item));
}

/**
 *
 */
export function buildUrlWithParams(endpoint: string, params: Record<string, any>) {
	const url = new URL(endpoint, 'http://dummybase'); // Dummy base, actual base URL is in httpClient
	Object.keys(params).forEach((key) => {
		if (params[key] !== undefined && params[key] !== null) {
			url.searchParams.append(key, params[key]);
		}
	});
	return url.pathname + url.search;
}
