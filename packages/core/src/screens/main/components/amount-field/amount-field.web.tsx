import * as React from 'react';

import { PriceKeypad, type PriceKeypadHandle } from '@wcpos/components/price-keypad';
import { QuantityKeypad } from '@wcpos/components/quantity-keypad';

import { useT } from '../../../../contexts/translations';
import { decimalSeparatorFormatter } from '../../pos/hooks/quick-discount';
import { useAmount } from './use-amount';
import { useScannerBurstDismiss } from './use-scanner-burst-dismiss';

import type { AmountFieldProps } from './types';

/** Web: a quantity grows into its keypad (decision 36), money into the price keypad (variant 1). */
export function AmountField(props: AmountFieldProps) {
	const {
		discounts,
		disabled,
		textClassName,
		placeholder,
		'aria-labelledby': labelledBy,
		'aria-describedby': describedBy,
		'aria-invalid': invalid,
		ref,
		testID,
		autoFocus,
	} = props;
	const { decimalSeparator, places: decimals, format, stored, commit } = useAmount(props);
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
	// A form's label press focuses the field, or blurs it: here the keypad opens or closes.
	React.useImperativeHandle(
		ref,
		() => ({
			focus: () => keypad.current?.focus(),
			blur: () => keypad.current?.dismiss(),
			isFocused: () => open,
		}),
		[open]
	);
	React.useEffect(() => {
		if (autoFocus) keypad.current?.focus();
	}, [autoFocus]);
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
	if (props.kind === 'quantity' || props.kind === 'count') {
		return (
			<QuantityKeypad
				ref={keypad}
				onOpenChange={setOpen}
				testID={testID}
				className={props.className}
				textClassName={textClassName}
				labelledBy={labelledBy}
				describedBy={describedBy}
				invalid={invalid}
				tone={props.tone}
				disabled={disabled}
				value={stored ?? 0}
				format={format}
				decimals={decimals}
				decimalSeparator={decimalSeparator}
				labels={{
					...labels,
					decrease: t('pos_cart.quantity_decrease'),
					increase: t('pos_cart.quantity_increase'),
					remove: t('common.remove'),
				}}
				onChange={commit}
				onRemove={props.onRemove}
			/>
		);
	}
	return (
		<PriceKeypad
			ref={keypad}
			onOpenChange={setOpen}
			testID={testID}
			textClassName={textClassName}
			rest={props.look === 'quiet' ? 'text' : (props.look ?? 'field')}
			placeholder={placeholder}
			labelledBy={labelledBy}
			describedBy={describedBy}
			invalid={invalid}
			disabled={disabled}
			// A blank price (no sale price) is not 0: it rests as `–` and writes only what is typed.
			value={stored}
			format={format}
			decimals={decimals}
			decimalSeparator={decimalSeparator || '.'}
			discounts={discounts}
			labels={labels}
			onChange={commit}
		/>
	);
}
