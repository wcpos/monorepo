import * as React from 'react';

import round from 'lodash/round';

import { QUANTITY_PLACES } from '@wcpos/components/quantity-keypad/reducer';
import { useDocField, useRecordField } from '@wcpos/query';

import { useAppState } from '../../../../contexts/app-state';
import { useCurrencyFormat } from '../../hooks/use-currency-format';
import { PERCENT_PLACES, useNumberFormat } from '../../hooks/use-number-format';
import { useCurrentOrderOptional } from '../../pos/contexts/current-order/context';

import type { AmountFieldProps } from './types';

export type Amount = ReturnType<typeof useAmount>;

/** The places a kind carries; money's are the currency's. */
const PLACES = { count: 0, quantity: QUANTITY_PLACES, percent: PERCENT_PLACES };

/**
 * What both adapters share: the store's separators and places (read here, once), the rest
 * text, and the one commit rule: at the kind's places, never the stored number again, and a
 * quantity committed as 0 is its line's remove.
 */
export function useAmount(props: AmountFieldProps) {
	const { kind, value, onCommit, onRemove } = props;
	const { store } = useAppState();
	const decimalSeparator =
		(useDocField(store, (state) => state.price_decimal_sep) as string) || '.';
	const thousandSeparator =
		(useDocField(store, (state) => state.price_thousand_sep) as string) || '';
	// WooCommerce's default, 2, before the store loads.
	const priceDecimals = useDocField(store, (state) => state.price_num_decimals);
	const places = kind === 'money' ? (props.places ?? Number(priceDecimals ?? 2)) : PLACES[kind];
	// A grid's price reads in the open order's currency on the POS, the store's elsewhere; a
	// field's number carries no symbol (its unit sits beside it).
	const currencySymbol = useRecordField(
		useCurrentOrderOptional(),
		(o) => o.payload.currency_symbol
	);
	const currency = useCurrencyFormat({ currencySymbol });
	const options = React.useMemo(
		() => ({ decimalScale: places, fixedDecimalScale: kind === 'money' }),
		[places, kind]
	);
	const number = useNumberFormat(options);
	const format = kind === 'money' && props.look === 'quiet' ? currency.format : number.format;
	const blank = value == null || value === '';
	const stored = blank && kind !== 'quantity' && kind !== 'count' ? undefined : Number(value) || 0;
	const commit = (next: number): void | boolean | Promise<void | boolean> => {
		const rounded = round(next, places);
		if (rounded === stored) return;
		if (rounded === 0 && onRemove) return onRemove();
		return onCommit(rounded) as void | Promise<void | boolean>;
	};
	return { places, decimalSeparator, thousandSeparator, format, stored, commit };
}
