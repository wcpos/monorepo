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

const PLACES = { count: 0, quantity: QUANTITY_PLACES, percent: PERCENT_PLACES };

/** Both adapters' separators, places, rest text and the one commit rule (read once, here). */
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
	// A grid's price is in the open order's currency on the POS; a field's number has no symbol.
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
	// Sent and pending: a commit compares with the last until the store holds it (2 → 3 → 4 → 3).
	const sent = React.useRef<{ last?: number; all: (number | undefined)[] }>({ all: [] });
	React.useEffect(() => {
		const { last, all } = sent.current;
		if (stored === last || !all.includes(stored)) sent.current = { all: [] };
	}, [stored]);
	const commit = (next: number): void | boolean | Promise<void | boolean> => {
		const rounded = round(next, places);
		if (rounded === (sent.current.last ?? stored)) return;
		sent.current = { last: rounded, all: [...sent.current.all, rounded] };
		if (rounded === 0 && onRemove) return onRemove();
		const written = onCommit(rounded) as void | Promise<void | boolean>;
		const refused = () => sent.current.last === rounded && (sent.current = { all: [] });
		void Promise.resolve(written).then((ok) => ok === false && refused(), refused);
		return written;
	};
	return { places, decimalSeparator, thousandSeparator, format, stored, commit };
}
