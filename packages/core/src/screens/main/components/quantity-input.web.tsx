import * as React from 'react';

import { QuantityKeypad, type QuantityKeypadHandle } from '@wcpos/components/quantity-keypad';
import { useDocField } from '@wcpos/query';

import { useAppState } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';
import { type NumberFormatOptions, useNumberFormat } from '../hooks/use-number-format';

// A quantity is not money: the currency's scale would cut 1.125 to 1.13. Six places, unpadded,
// as the numpad showed it; the box and the open keypad share it so the number never jumps.
const QUANTITY_FORMAT: NumberFormatOptions = { fixedDecimalScale: false, decimalScale: 6 };

export interface QuantityInputProps {
	value?: number | string;
	/** Resolving `false`: the store refused the quantity, and the keypad takes its step back. */
	onChangeText: (quantity: number) => void | boolean | Promise<void | boolean>;
	/** − at 1: the line's own remove path. */
	onRemove: () => void;
	className?: string;
	textClassName?: string;
	testID?: string;
	/** `focus()` opens the keypad, as a press does. */
	ref?: React.Ref<{ focus: () => void }>;
	// The native field's props; the keypad has no text field to style or select.
	inputClassName?: string;
	selectTextOnFocus?: boolean;
}

/** Web: the cart quantity box grows into its keypad (decision 36). */
export function QuantityInput({
	value,
	onChangeText,
	onRemove,
	className,
	textClassName,
	testID,
	ref,
}: QuantityInputProps) {
	const { store } = useAppState();
	const decimalSeparator = useDocField(store, (state) => state.price_decimal_sep) as
		string | undefined;
	const { format } = useNumberFormat(QUANTITY_FORMAT);
	const t = useT();
	const keypad = React.useRef<QuantityKeypadHandle>(null);
	React.useImperativeHandle(ref, () => ({ focus: () => keypad.current?.focus() }), []);
	const [open, setOpen] = React.useState(false);
	/**
	 * A scanner burst while the keypad is open: the wedge detector (`use-barcode-detection`)
	 * never latches a burst's first key, so that digit reaches the keypad, and it swallows the
	 * rest. Its mark on a latched key is `defaultPrevented`, set in its own capture listener on
	 * the document. This one is registered on open, after the route's detector, and same-node
	 * listeners run in registration order whatever `stopPropagation` says, so it sees the mark:
	 * the keypad closes, keeping the stored quantity. An effect: the document is outside React.
	 */
	React.useEffect(() => {
		if (!open) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.defaultPrevented) keypad.current?.dismiss();
		};
		document.addEventListener('keydown', onKey, true);
		return () => document.removeEventListener('keydown', onKey, true);
	}, [open]);
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
			value={Number(value ?? 0)}
			format={format}
			decimalSeparator={decimalSeparator || '.'}
			labels={labels}
			onChange={onChangeText}
			onRemove={onRemove}
		/>
	);
}
