import * as React from 'react';

import { QuantityKeypad, type QuantityKeypadHandle } from '@wcpos/components/quantity-keypad';
import { useDocField } from '@wcpos/query';

import { useAppState } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';
import { QUANTITY_FORMAT, useNumberFormat } from '../hooks/use-number-format';
import { useScannerBurstDismiss } from './use-scanner-burst-dismiss';

import type { KeypadFieldHandle } from './money-input';

export interface QuantityInputProps {
	value?: number | string;
	/** Resolving `false`: the store refused the quantity, and the keypad takes its step back. */
	onChangeText: (quantity: number) => void | boolean | Promise<void | boolean>;
	/** − at 1: the line's own remove path. Without it the keypad edits a count (stock). */
	onRemove?: () => void;
	/** The places the quantity carries; 0 for a whole count (WooCommerce stock is an integer). */
	decimals?: number;
	disabled?: boolean;
	className?: string;
	textClassName?: string;
	testID?: string;
	/** A form label's id, naming the trigger. */
	'aria-labelledby'?: string;
	/** `focus()` opens the keypad, as a press does; a form's label press toggles it. */
	ref?: React.Ref<KeypadFieldHandle>;
	// The native field's props; the keypad has no text field to style or select.
	inputClassName?: string;
	selectTextOnFocus?: boolean;
}

/** Web: the cart quantity box grows into its keypad (decision 36). */
export function QuantityInput({
	value,
	onChangeText,
	onRemove,
	decimals,
	disabled,
	className,
	textClassName,
	testID,
	'aria-labelledby': labelledBy,
	ref,
}: QuantityInputProps) {
	const { store } = useAppState();
	const decimalSeparator = useDocField(store, (state) => state.price_decimal_sep) as
		string | undefined;
	const formatOptions = React.useMemo(
		() =>
			decimals === undefined ? QUANTITY_FORMAT : { ...QUANTITY_FORMAT, decimalScale: decimals },
		[decimals]
	);
	const { format } = useNumberFormat(formatOptions);
	const t = useT();
	const keypad = React.useRef<QuantityKeypadHandle>(null);
	const [open, setOpen] = React.useState(false);
	React.useImperativeHandle(
		ref,
		() => ({
			focus: () => keypad.current?.focus(),
			blur: () => keypad.current?.dismiss(),
			isFocused: () => open,
		}),
		[open]
	);
	useScannerBurstDismiss(open, keypad);
	const labels = React.useMemo(
		() => ({
			decrease: t('pos_cart.quantity_decrease'),
			increase: t('pos_cart.quantity_increase'),
			remove: t('common.remove'),
			backspace: t('common.backspace'),
			done: t('common.done'),
		}),
		[t]
	);
	return (
		<QuantityKeypad
			ref={keypad}
			onOpenChange={setOpen}
			testID={testID}
			className={className}
			textClassName={textClassName}
			labelledBy={labelledBy}
			value={Number(value ?? 0)}
			format={format}
			decimals={decimals}
			disabled={disabled}
			decimalSeparator={decimalSeparator || '.'}
			labels={labels}
			onChange={onChangeText}
			onRemove={onRemove}
		/>
	);
}
