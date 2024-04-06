import * as React from 'react';

import defaults from 'lodash/defaults';
import get from 'lodash/get';
import { useObservableEagerState } from 'observable-hooks';

import {
	toNumericString,
	roundToPrecision,
	splitDecimal,
	limitToScale,
	applyThousandSeparator,
} from './format.helpers';
import symbols from './symbols.json';
import { useAppState } from '../../../../contexts/app-state';

interface CurrencyFormatProps {
	/**
	 *
	 */
	withSymbol?: boolean;
	/**
	 *
	 */
	currencySymbol?: string;
}

/**
 *
 */
export const useCurrencyFormat = (options?: CurrencyFormatProps) => {
	const { store } = useAppState();
	const currency = useObservableEagerState(store?.currency$);
	const storeCurrencySymbol = get(symbols, currency);
	const { withSymbol, currencySymbol } = defaults(options, {
		withSymbol: true,
		currencySymbol: storeCurrencySymbol,
	});
	const currencyPosition = useObservableEagerState(store?.currency_pos$);
	const decimalSeparator = useObservableEagerState(store?.price_decimal_sep$);
	const thousandSeparator = useObservableEagerState(store?.price_thousand_sep$);
	const decimalPrecision = useObservableEagerState(store?.price_num_decimals$);
	const fixedDecimalPrecision = true;
	const allowNegative = true;
	const thousandsGroupStyle = 'thousand';

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
			if (withSymbol) {
				if (currencySymbol && (currencyPosition === 'left' || currencyPosition === 'left_space')) {
					beforeDecimal =
						currencyPosition === 'left_space'
							? `${currencySymbol} ${beforeDecimal}`
							: currencySymbol + beforeDecimal;
				}
				if (
					currencySymbol &&
					(currencyPosition === 'right' || currencyPosition === 'right_space')
				) {
					afterDecimal +=
						currencyPosition === 'right_space' ? ` ${currencySymbol}` : currencySymbol;
				}
			}

			// restore negation sign
			if (addNegation) beforeDecimal = `- ${beforeDecimal}`;

			return beforeDecimal + ((hasDecimalSeparator && decimalSeparator) || '') + afterDecimal;
		},
		[
			allowNegative,
			currencyPosition,
			currencySymbol,
			decimalPrecision,
			decimalSeparator,
			fixedDecimalPrecision,
			thousandSeparator,
			withSymbol,
		]
	);

	/**
	 *
	 */
	const format = React.useCallback(
		(value: number | string | undefined) => {
			let numStr = value || '0';

			if (typeof numStr === 'number') {
				numStr = toNumericString(numStr);
			}

			numStr = roundToPrecision(numStr, decimalPrecision || 2, fixedDecimalPrecision);

			return formatAsNumber(numStr);
		},
		[decimalPrecision, fixedDecimalPrecision, formatAsNumber]
	);

	/**
	 *
	 */
	const unformat = (value: string) => {
		return '';
	};

	/**
	 *
	 */
	return { format, unformat };
};
