import * as React from 'react';
import isNil from 'lodash/isNil';
import get from 'lodash/get';
import Text from '../text';
import {
	toNumericString,
	roundToPrecision,
	splitDecimal,
	limitToScale,
	applyThousandSeparator,
} from './format-number.helpers';
import symbols from './symbols.json';

type Currency = Extract<keyof typeof symbols, string>;

export interface FormatNumberProps {
	value: number | string;
	defaultValue?: number | string;
	decimalSeparator?: string;
	thousandSeparator?: string | boolean;
	thousandsGroupStyle?: 'thousand' | 'lakh' | 'wan';
	decimalPrecision?: number;
	fixedDecimalPrecision?: boolean;
	currency?: Currency;
	currencyPosition?: 'left' | 'right' | 'left_space' | 'right_space';
	format?: string | ((value: number) => string);
	allowEmptyFormatting?: boolean;
	allowedDecimalSeparators?: string[];
	prefix?: string;
	suffix?: string;
	allowNegative?: boolean;
	mask?: string;
	isNumericString?: boolean;
}

export const FormatNumber = ({
	defaultValue,
	decimalSeparator = '.',
	thousandsGroupStyle = 'thousand',
	decimalPrecision,
	fixedDecimalPrecision = false,
	currency,
	currencyPosition = 'left',
	format,
	allowEmptyFormatting = false,
	allowedDecimalSeparators = ['.'],
	allowNegative = true,
	...props
}: FormatNumberProps) => {
	const thousandSeparator = props.thousandSeparator === true ? ',' : props.thousandSeparator;

	if (decimalSeparator === thousandSeparator) {
		throw new Error(`
				Decimal separator can't be same as thousand separator.
				thousandSeparator: ${thousandSeparator} (thousandSeparator = {true} is same as thousandSeparator = ",")
				decimalSeparator: ${decimalSeparator} (default value for decimalSeparator is .)
		 `);
	}

	/**
	 *
	 */
	const prefix = React.useMemo(() => {
		let pre = props.prefix || '';
		if (currency && (currencyPosition === 'left' || currencyPosition === 'left_space')) {
			const symbol = get(symbols, currency);
			pre += currencyPosition === 'left_space' ? `${symbol} ` : symbol;
		}
		return pre;
	}, [currency, currencyPosition, props.prefix]);

	/**
	 *
	 */
	const suffix = React.useMemo(() => {
		let end = props.suffix || '';
		if (currency && (currencyPosition === 'right' || currencyPosition === 'right_space')) {
			const symbol = get(symbols, currency);
			end = currencyPosition === 'right_space' ? ` ${symbol}${end}` : symbol + end;
		}
		return end;
	}, [currency, currencyPosition, props.suffix]);

	/**
	 *
	 */
	const formatAsNumber = React.useCallback(
		(numStr: string) => {
			const hasDecimalSeparator =
				numStr.indexOf('.') !== -1 || (decimalPrecision && fixedDecimalPrecision);
			let { beforeDecimal, afterDecimal, addNegation } = splitDecimal(numStr, allowNegative); // eslint-disable-line prefer-const

			// apply decimal precision if its defined
			if (decimalPrecision !== undefined) {
				afterDecimal = limitToScale(afterDecimal, decimalPrecision, fixedDecimalPrecision);
			}

			if (thousandSeparator) {
				beforeDecimal = applyThousandSeparator(
					beforeDecimal,
					thousandSeparator,
					thousandsGroupStyle
				);
			}

			// add prefix and suffix
			if (prefix) beforeDecimal = prefix + beforeDecimal;
			if (suffix) afterDecimal += suffix;

			// restore negation sign
			if (addNegation) beforeDecimal = `-${beforeDecimal}`;

			return beforeDecimal + ((hasDecimalSeparator && decimalSeparator) || '') + afterDecimal;
		},
		[
			allowNegative,
			decimalPrecision,
			decimalSeparator,
			fixedDecimalPrecision,
			prefix,
			suffix,
			thousandSeparator,
			thousandsGroupStyle,
		]
	);

	/**
	 *
	 */
	const getMaskAtIndex = React.useCallback(() => {
		const { mask = ' ' } = props;
		if (typeof mask === 'string') {
			return mask;
		}

		return mask[index] || ' ';
	}, [props]);

	/**
	 *
	 */
	const formatWithPattern = React.useCallback(
		(numStr: string) => {
			let hashCount = 0;
			const formattedNumberAry = format.split('');
			for (let i = 0, ln = format.length; i < ln; i++) {
				if (format[i] === '#') {
					formattedNumberAry[i] = numStr[hashCount] || getMaskAtIndex(hashCount);
					hashCount += 1;
				}
			}
			return formattedNumberAry.join('');
		},
		[format, getMaskAtIndex]
	);

	/**
	 *
	 */
	const formatNumString = React.useCallback(
		(numStr = '') => {
			let formattedValue = numStr;

			if (numStr === '' && !allowEmptyFormatting) {
				formattedValue = '';
			} else if (numStr === '-' && !format) {
				formattedValue = '-';
			} else if (typeof format === 'string') {
				formattedValue = formatWithPattern(formattedValue);
			} else if (typeof format === 'function') {
				formattedValue = format(formattedValue);
			} else {
				formattedValue = formatAsNumber(formattedValue);
			}

			return formattedValue;
		},
		[allowEmptyFormatting, format, formatAsNumber, formatWithPattern]
	);

	/**
	 *
	 */
	const formatInput = React.useCallback((val) => {
		return val;
	}, []);

	/**
	 *
	 */
	const formattedValue = React.useMemo(() => {
		let { isNumericString } = props;

		// if value is undefined or null, use defaultValue instead
		let value = isNil(props.value) ? defaultValue : props.value;

		if (typeof value === 'number') {
			value = toNumericString(value);
			isNumericString = true;
		}

		// change infinity value to empty string
		if (value === 'Infinity' && isNumericString) {
			value = '';
		}

		// round the number based on decimalPrecision
		// format only if non formatted value is provided
		if (isNumericString && !format && typeof decimalPrecision === 'number') {
			value = roundToPrecision(value, decimalPrecision, fixedDecimalPrecision);
		}

		return isNumericString ? formatNumString(value) : formatInput(value);
	}, [
		decimalPrecision,
		defaultValue,
		fixedDecimalPrecision,
		format,
		formatInput,
		formatNumString,
		props,
	]);

	/**
	 *
	 */
	return <Text>{formattedValue}</Text>;
};
