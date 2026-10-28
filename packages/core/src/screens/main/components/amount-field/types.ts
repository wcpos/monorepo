import type * as React from 'react';

/** `focus()` opens the keypad (web) or focuses the field (native), as a form label's press does. */
export type AmountFieldHandle = { focus: () => void; blur: () => void; isFocused: () => boolean };

/** One props type for both adapters, so a caller typechecks the same on web and native. */
export interface AmountFieldProps {
	/** What the number is: it decides the places (the currency's, hundredths, six, whole) and keys. */
	kind: 'money' | 'percent' | 'quantity' | 'count';
	/** As stored (WooCommerce's strings are read here); a blank money or percentage is never 0. */
	value: number | string | null | undefined;
	/** A changed number at the kind's places; resolving `false` takes a keypad step back. */
	onCommit: (value: number) => unknown;
	/** Native: each readable draft as it is typed (a keypad commits as it closes). */
	onDraftChange?: (value: number) => void;
	/** A quantity committed as 0, or the keypad's − at 1: the line's own remove. */
	onRemove?: () => void;
	/** `quiet`: a grid cell's text, pressed to edit in place. A quantity or count is always the box. */
	look?: 'quiet' | 'field';
	/** Money held to other places than the store's prices (a refund's). */
	places?: number;
	/** The price keypad's quick discounts, in percent. */
	discounts?: number[];
	/** `attention`: the box marks its number (a line over stock). */
	tone?: 'attention';
	placeholder?: string;
	disabled?: boolean;
	autoFocus?: boolean;
	/** The box's layout; the number's text. */
	className?: string;
	textClassName?: string;
	testID?: string;
	'aria-labelledby'?: string;
	'aria-describedby'?: string;
	'aria-invalid'?: boolean;
	ref?: React.Ref<AmountFieldHandle>;
}
