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
	disabled?: boolean;
	/** Rest-state text classes. */
	textClassName?: string;
	testID?: string;
}

/** Native: the price is the plain field in place (decision 16); the web price grows into a keypad. */
export function MoneyInput({ value, format, discounts: _discounts, ...props }: MoneyInputProps) {
	return <EditableNumber {...props} value={value} display={format(Number(value) || 0)} />;
}
