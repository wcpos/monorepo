import * as React from 'react';

import defaults from 'lodash/defaults';
import { useObservableEagerState } from 'observable-hooks';
import { useNumericFormat, NumericFormatProps } from 'react-number-format';

import { useAppState } from '../../../contexts/app-state';

export interface NumberFormatOptions {
	thousandSeparator?: string;
	decimalSeparator?: string;
	allowedDecimalSeparators?: string[];
	thousandsGroupStyle?: 'thousand' | 'lakh' | 'wan';
	decimalScale?: number;
	fixedDecimalScale?: boolean;
	allowNegative?: boolean;
	allowLeadingZeros?: boolean;
	suffix?: string;
	prefix?: string;
}

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
		return defaults(options, {
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
	}, [options, thousandSeparator, decimalSeparator, decimalPrecision, thousandsGroupStyle]);

	/**
	 *
	 */
	const { format: _format, ...rest } = useNumericFormat(mergedOptions as NumericFormatProps);

	/**
	 * To prevent confusion, force the input value to be a number.
	 */
	const format = React.useCallback(
		(value: number) => {
			return _format(value.toString());
		},
		[_format]
	);

	return {
		format,
		...rest,
	};
};
