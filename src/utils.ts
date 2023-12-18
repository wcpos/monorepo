/**
 *
 * @param value
 * @returns
 */
export function isArrayOfIntegers(value) {
	return Array.isArray(value) && value.every((item) => Number.isInteger(item));
}
