import * as React from 'react';

import { cn } from '@wcpos/components/lib/utils';

import { EditableNumber } from './editable-number';
import { NumberInput } from './number-input';

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
	/** Rests as an outlined input field (the keypad's trigger on web), not bare text. */
	field?: boolean;
	testID?: string;
}

/** Native: the price is the plain field in place (decision 16); the web price grows into a keypad. */
export function MoneyInput({
	value,
	format,
	discounts: _discounts,
	decimals: _decimals,
	textClassName,
	field,
	...props
}: MoneyInputProps) {
	// The plain field, outlined at rest.
	if (field) return <NumberInput {...props} value={value} />;
	// A blank price (no sale price) rests as WooCommerce's `–`, muted, never `0.00`.
	const blank = value == null || value === '';
	return (
		<EditableNumber
			{...props}
			value={value}
			display={blank ? '–' : format(Number(value) || 0)}
			textClassName={cn(textClassName, blank && 'text-muted-foreground')}
		/>
	);
}
