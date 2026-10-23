import * as React from 'react';

import { QuantityKeypad } from '@wcpos/components/quantity-keypad';
import { useDocField } from '@wcpos/query';

import { useAppState } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';
import { useNumberFormat } from '../hooks/use-number-format';

export interface QuantityInputProps {
	value?: number | string;
	onChangeText: (quantity: number) => void;
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
	const { format } = useNumberFormat();
	const t = useT();
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
			ref={ref}
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
