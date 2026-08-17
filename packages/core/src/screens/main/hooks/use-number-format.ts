import * as React from 'react';

import defaults from 'lodash/defaults';
import round from 'lodash/round';
import { NumericFormatProps, numericFormatter } from 'react-number-format';

import { useDocField } from '@wcpos/query';

import { useAppState } from '../../../contexts/app-state';

export type NumberFormatOptions = NumericFormatProps;

/**
 * Custom hook to format numbers based on application state and provided options.
 */
export const useNumberFormat = (options?: NumberFormatOptions) => {
	const { store } = useAppState();

	const decimalSeparator = useDocField(store, (state) => state.price_decimal_sep);
	const thousandSeparator = useDocField(store, (state) => state.price_thousand_sep);
	const decimalPrecision = useDocField(store, (state) => state.price_num_decimals);
	const thousandsGroupStyle = useDocField(store, (state) => state.thousands_group_style);

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
