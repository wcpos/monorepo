/**
 * Get Object type.
 * @param obj {*} object to get type
 * @returns {*}
 */
function getObjectType(obj: any) {
	if (
		obj !== null &&
		typeof obj === 'object' &&
		!Array.isArray(obj) &&
		typeof obj[Symbol.iterator] === 'function'
	) {
		return 'Iterable';
	}
	return Object.prototype.toString.call(obj).slice(8, -1);
}

/**
 * Parse.
 * @param string {String} string to parse
 * @returns {*}
 */
function parse(string: string) {
	let result = string;

	// Check if string contains 'function' and start with it to eval it
	if (result.indexOf('function') === 0) {
		return eval(`(${result})`); // eslint-disable-line no-eval
	}

	try {
		result = JSON.parse(string);
	} catch (e) {
		// Error
	}
	return result;
}

export { getObjectType, parse };
