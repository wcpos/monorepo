import * as React from 'react';

import { PriceKeypad, type PriceKeypadHandle } from '@wcpos/components/price-keypad';
import { useDocField } from '@wcpos/query';

import { useAppState } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';
import { decimalSeparatorFormatter } from '../pos/hooks/quick-discount';
import { useScannerBurstDismiss } from './use-scanner-burst-dismiss';

import type { MoneyInputProps } from './money-input';

/** Web: the price grows into its keypad, as the quantity does (Paul 2026-10-24, variant 1). */
export function MoneyInput({
	value,
	format,
	onChangeText,
	discounts,
	decimals: ownDecimals,
	disabled,
	textClassName,
	testID,
}: MoneyInputProps) {
	const { store } = useAppState();
	const decimalSeparator = useDocField(store, (state) => state.price_decimal_sep) as
		string | undefined;
	// WooCommerce's default, 2, before the store loads.
	const priceDecimals = useDocField(store, (state) => state.price_num_decimals);
	const decimals = ownDecimals ?? Number(priceDecimals ?? 2);
	const t = useT();
	// The percent with the store's separator at its own scale, as the cart's discount line names
	// it: a comma store reads "12,5", and a store pricing to 0 places never reads 12.5 % as "12".
	const formatNumber = React.useMemo(
		() => decimalSeparatorFormatter(decimalSeparator),
		[decimalSeparator]
	);
	const keypad = React.useRef<PriceKeypadHandle>(null);
	const [open, setOpen] = React.useState(false);
	useScannerBurstDismiss(open, keypad);
	const labels = React.useMemo(
		() => ({
			backspace: t('common.backspace'),
			done: t('common.done'),
			discount: (percent: number) =>
				t('pos_cart.discount_percent', { percent: formatNumber(percent) }),
			discountKey: (percent: number) => `−${formatNumber(percent)}%`,
		}),
		[t, formatNumber]
	);
	return (
		<PriceKeypad
			ref={keypad}
			onOpenChange={setOpen}
			testID={testID}
			textClassName={textClassName}
			disabled={disabled}
			// A blank price (no sale price) is not 0: it rests as `–` and writes only what is typed.
			value={value == null || value === '' ? undefined : Number(value) || 0}
			format={format}
			decimals={decimals}
			decimalSeparator={decimalSeparator || '.'}
			discounts={discounts}
			labels={labels}
			onChange={onChangeText}
		/>
	);
}
