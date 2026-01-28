import isNaN from 'lodash/isNaN';
import toNumber from 'lodash/toNumber';

/**
 * Convert a decimal value to a sortable integer for RxDB indexing.
 *
 * RxDB requires `multipleOf` for indexed number fields, but floating-point
 * values like 2137.3 can't be exactly represented in IEEE 754, causing
 * `multipleOf: 0.000001` validation to fail.
 *
 * Solution: Store as integer (value * 1,000,000) with multipleOf: 1.
 * This preserves 6 decimal places of precision as an exact integer.
 *
 * @param value - The value to convert (can be string, number, or any type)
 * @returns The sortable integer representation, or 0 if the value is invalid
 *
 * @example
 * toSortableInteger('9.99') // => 9990000
 * toSortableInteger(10.50) // => 10500000
 * toSortableInteger('invalid') // => 0
 * toSortableInteger(null) // => 0
 */
export const toSortableInteger = (value: any): number => {
	const num = toNumber(value);
	if (isNaN(num)) return 0;
	return Math.round(num * 1000000);
};

/**
 * Convert a sortable integer back to a decimal value.
 *
 * This is the inverse of toSortableInteger.
 *
 * @param sortableInt - The sortable integer to convert
 * @returns The original decimal value
 *
 * @example
 * fromSortableInteger(9990000) // => 9.99
 * fromSortableInteger(10500000) // => 10.5
 */
export const fromSortableInteger = (sortableInt: number): number => {
	return sortableInt / 1000000;
};
