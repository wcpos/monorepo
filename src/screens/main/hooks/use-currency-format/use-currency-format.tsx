import * as React from 'react';

import defaults from 'lodash/defaults';
import get from 'lodash/get';
import { useObservableState } from 'observable-hooks';

import {
	toNumericString,
	roundToPrecision,
	splitDecimal,
	limitToScale,
	applyThousandSeparator,
} from './format.helpers';
import symbols from './symbols.json';
import { useAppStateManager } from '../../../../contexts/app-state-manager';

interface CurrencyFormatProps {
	/**
	 *
	 */
	withSymbol?: boolean;
}

/**
 *
 */
export const useCurrencyFormat = (options?: CurrencyFormatProps) => {
	const { withSymbol } = defaults(options, { withSymbol: true });
	const appState = useAppStateManager();
	const store = useObservableState(appState.store$, appState.store);
	const currency = useObservableState(store?.currency$, store?.currency);
	const currencyPosition = useObservableState(store?.currency_pos$, store?.currency_pos);
	const decimalSeparator = useObservableState(store?.price_decimal_sep$, store?.price_decimal_sep);
	const thousandSeparator = useObservableState(
		store?.price_thousand_sep$,
		store?.price_thousand_sep
	);
	const decimalPrecision = useObservableState(
		store?.price_num_decimals$,
		store?.price_num_decimals
	);
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
				const symbol = get(symbols, currency);
				if (symbol && (currencyPosition === 'left' || currencyPosition === 'left_space')) {
					beforeDecimal =
						currencyPosition === 'left_space'
							? `${symbol} ${beforeDecimal}`
							: symbol + beforeDecimal;
				}
				if (symbol && (currencyPosition === 'right' || currencyPosition === 'right_space')) {
					afterDecimal += currencyPosition === 'right_space' ? ` ${symbol}` : symbol;
				}
			}

			// restore negation sign
			if (addNegation) beforeDecimal = `- ${beforeDecimal}`;

			return beforeDecimal + ((hasDecimalSeparator && decimalSeparator) || '') + afterDecimal;
		},
		[
			allowNegative,
			currency,
			currencyPosition,
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
