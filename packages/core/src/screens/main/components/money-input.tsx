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
	/** A blank field's rest text. */
	placeholder?: string;
	/** A form's label, description and validation message ids, for the web keypad's trigger. */
	'aria-labelledby'?: string;
	'aria-describedby'?: string;
	'aria-invalid'?: boolean;
	/** A form's handle (`FormInput`'s label press); the web keypad opens as a field focuses. */
	ref?: React.Ref<KeypadFieldHandle>;
	testID?: string;
}

export type KeypadFieldHandle = { focus: () => void; blur: () => void; isFocused: () => boolean };

/** What `FormInput` hands its control: the label, description and message ids, the error state. */
export type FormFieldAria = {
	'aria-labelledby'?: string;
	'aria-describedby'?: string;
	'aria-invalid'?: boolean;
};

/** Native: the price is the plain field in place (decision 16); the web price grows into a keypad. */
export function MoneyInput({
	value,
	format,
	discounts: _discounts,
	decimals: _decimals,
	textClassName,
	field,
	placeholder,
	'aria-labelledby': _labelledBy,
	'aria-describedby': _describedBy,
	'aria-invalid': _invalid,
	ref: _ref,
	...props
}: MoneyInputProps) {
	// The plain field, outlined at rest.
	if (field) return <NumberInput {...props} value={value} placeholder={placeholder} />;
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
