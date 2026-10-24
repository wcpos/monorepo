import * as React from 'react';

import { QuantityKeypad, type QuantityKeypadHandle } from '@wcpos/components/quantity-keypad';
import { useDocField } from '@wcpos/query';

import { useAppState } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';
import { QUANTITY_FORMAT, useNumberFormat } from '../hooks/use-number-format';

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
	const minChars = useDocField(store, (state) => state.barcode_scanning_min_chars) as
		number | undefined;
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
	 * listeners run in registration order whatever `stopPropagation` says, so it sees the mark.
	 * The detector latches on timing alone, so a quick typist's second key is marked too; only
	 * a run of marked keys as long as the store's minimum barcode (less the unmarked first key)
	 * is a scan, the length the detector itself accepts. Then the keypad closes, keeping the
	 * stored quantity. Any unmarked key ends the run. An effect: the document is outside React.
	 */
	const scanRun = Math.max(1, (Number(minChars) || 0) - 1);
	React.useEffect(() => {
		if (!open) return;
		let marked = 0;
		const onKey = (event: KeyboardEvent) => {
			marked = event.defaultPrevented ? marked + 1 : 0;
			if (marked >= scanRun) keypad.current?.dismiss();
		};
		document.addEventListener('keydown', onKey, true);
		return () => document.removeEventListener('keydown', onKey, true);
	}, [open, scanRun]);
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
