import * as React from 'react';

import { EditableNumber } from './editable-number';

import type { NumberFormatOptions } from '../hooks/use-number-format';

export interface MoneyInputProps {
	value?: number | string;
	/** The order's currency format (or the store's number format), for the rest text. */
	format: (value: number) => string;
	/** The native field's options. */
	formatOptions?: NumberFormatOptions;
	onChangeText: (value: number) => void;
	/** Quick discounts (percent): the web keypad's quick keys. */
	discounts?: number[];
	/**
	 * The places the number may carry; the store's price places when absent. A percentage
	 * is not money: a percentage fee passes its own, so a zero-decimal store still takes 2.5 %.
	 */
	decimals?: number;
	disabled?: boolean;
	/** Rest-state text classes. */
	textClassName?: string;
	testID?: string;
}

/** Native: the price is the plain field in place (decision 16); the web price grows into a keypad. */
export function MoneyInput({
	value,
	format,
	discounts: _discounts,
	decimals: _decimals,
	...props
}: MoneyInputProps) {
	return <EditableNumber {...props} value={value} display={format(Number(value) || 0)} />;
}
