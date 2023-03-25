/**
 *
 */
function repeat(str: string, count: number) {
	return Array(count + 1).join(str);
}

/**
 * limit decimal numbers to given scale
 * Not used .fixedTo because that will break with big numbers
 */
export function limitToScale(numStr: string, scale: number, fixedDecimalScale: boolean) {
	let str = '';
	const filler = fixedDecimalScale ? '0' : '';
	for (let i = 0; i <= scale - 1; i++) {
		str += numStr[i] || filler;
	}
	return str;
}

/**
 *
 */
export function toNumericString(number: number) {
	let num = String(number); // typecast number to string

	// store the sign and remove it from the number.
	const sign = num[0] === '-' ? '-' : '';
	if (sign) num = num.substring(1);

	// split the number into cofficient and exponent
	const [coefficient, exponent] = num.split(/[eE]/g);

	// covert exponent to number;
	const exp = Number(exponent);

	// if there is no exponent part or its 0, return the coffiecient with sign
	if (!exp) return sign + coefficient;

	let coeff = coefficient.replace('.', '');

	/**
	 * for scientific notation the current decimal index will be after first number (index 0)
	 * So effective decimal index will always be 1 + exponent value
	 */
	const decimalIndex = 1 + exp;

	const coffiecientLn = coeff.length;

	if (decimalIndex < 0) {
		// if decimal index is less then 0 add preceding 0s
		// add 1 as join will have
		coeff = `0.${repeat('0', Math.abs(decimalIndex))}${coeff}`;
	} else if (decimalIndex >= coffiecientLn) {
		// if decimal index is less then 0 add leading 0s
		coeff += repeat('0', decimalIndex - coffiecientLn);
	} else {
		// else add decimal point at proper index
		coeff = `${coeff.substring(0, decimalIndex) || '0'}.${coeff.substring(decimalIndex)}`;
	}

	return sign + coeff;
}

/**
 *
 */
export function getThousandsGroupRegex(thousandsGroupStyle: string) {
	switch (thousandsGroupStyle) {
		case 'lakh':
			return /(\d+?)(?=(\d\d)+(\d)(?!\d))(\.\d+)?/g;
		case 'wan':
			return /(\d)(?=(\d{4})+(?!\d))/g;
		case 'thousand':
		default:
			return /(\d)(?=(\d{3})+(?!\d))/g;
	}
}

/**
 *
 */
export function applyThousandSeparator(
	str: string,
	thousandSeparator: string,
	thousandsGroupStyle: string
) {
	const thousandsGroupRegex = getThousandsGroupRegex(thousandsGroupStyle);
	let index = str.search(/[1-9]/);
	index = index === -1 ? str.length : index;
	return (
		str.substring(0, index) +
		str.substring(index, str.length).replace(thousandsGroupRegex, `$1${thousandSeparator}`)
	);
}

// spilt a float number into different parts beforeDecimal, afterDecimal, and negation
export function splitDecimal(numStr: string, allowNegative = true) {
	const hasNagation = numStr[0] === '-';
	const addNegation = hasNagation && allowNegative;
	const str = numStr.replace('-', '');

	const parts = str.split('.');
	const beforeDecimal = parts[0];
	const afterDecimal = parts[1] || '';

	return {
		beforeDecimal,
		afterDecimal,
		hasNagation,
		addNegation,
	};
}

/**
 *
 */
export function roundHalfUp(number, decimalPlaces) {
	const multiplier = Math.pow(10, decimalPlaces);
	return Math.round(number * multiplier) / multiplier;
}

/**
 * This method is required to round prop value to given scale.
 * Not used .round or .fixedTo because that will break with big numbers
 */
export function roundToPrecision(numStr: string, scale: number, fixedDecimalScale: boolean) {
	// if number is empty don't do anything return empty string
	if (['', '-'].indexOf(numStr) !== -1) return numStr;

	const shoudHaveDecimalSeparator = numStr.indexOf('.') !== -1 && scale;
	const { beforeDecimal, afterDecimal, hasNagation } = splitDecimal(numStr);
	const floatValue = parseFloat(`0.${afterDecimal || '0'}`);
	const floatValueRounded = roundHalfUp(floatValue, scale);
	const floatValueStr = floatValueRounded.toFixed(scale);
	const roundedDecimalParts = floatValueStr.split('.');
	const intPart = beforeDecimal
		.split('')
		.reverse()
		.reduce((roundedStr, current, idx) => {
			if (roundedStr.length > idx) {
				return (
					(Number(roundedStr[0]) + Number(current)).toString() +
					roundedStr.substring(1, roundedStr.length)
				);
			}
			return current + roundedStr;
		}, roundedDecimalParts[0]);

	const decimalPart = limitToScale(
		roundedDecimalParts[1] || '',
		Math.min(scale, afterDecimal.length),
		fixedDecimalScale
	);
	const negation = hasNagation ? '-' : '';
	const decimalSeparator = shoudHaveDecimalSeparator ? '.' : '';
	return `${negation}${intPart}${decimalSeparator}${decimalPart}`;
}
