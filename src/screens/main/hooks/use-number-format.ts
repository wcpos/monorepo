import * as React from 'react';

import defaults from 'lodash/defaults';
import round from 'lodash/round';
import { useObservableEagerState } from 'observable-hooks';
import { numericFormatter, NumericFormatProps } from 'react-number-format';

import { useAppState } from '../../../contexts/app-state';

export interface NumberFormatOptions extends NumericFormatProps {}

/**
 * Custom hook to format numbers based on application state and provided options.
 */
export const useNumberFormat = (options?: NumberFormatOptions) => {
	const { store } = useAppState();

	const decimalSeparator = useObservableEagerState(store?.price_decimal_sep$);
	const thousandSeparator = useObservableEagerState(store?.price_thousand_sep$);
	const decimalPrecision = useObservableEagerState(store?.price_num_decimals$);
	const thousandsGroupStyle = useObservableEagerState(store?.thousands_group_style$);

	/**
	 *
	 */
	const mergedOptions = React.useMemo(() => {
		const opts = defaults(options, {
			thousandSeparator,
			decimalSeparator,
			decimalScale: decimalPrecision,
			allowNegative: true,
			allowLeadingZeros: false,
			fixedDecimalScale: false,
			thousandsGroupStyle,
			allowedDecimalSeparators: ['.'],
			suffix: '',
			prefix: '',
		});
		return opts;
	}, [options, thousandSeparator, decimalSeparator, decimalPrecision, thousandsGroupStyle]);

	/**
	 *
	 */
	// const { format: _format, ...rest } = useNumericFormat(mergedOptions as NumericFormatProps);

	/**
	 * To prevent confusion, force the input value to be a number.
	 */
	const format = React.useCallback(
		(value: number | null | undefined) => {
			let safeValue = value ?? 0;
			/**
			 * react-number-format will not round the number if decimalScale is set.
			 * I think we do want rounding of our 6 dp numbers to the store setting.
			 */
			if (mergedOptions.fixedDecimalScale) {
				safeValue = round(safeValue, mergedOptions.decimalScale);
			}
			return numericFormatter(safeValue.toString(), mergedOptions);
		},
		[mergedOptions]
	);

	return {
		format,
	};
};
