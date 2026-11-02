import * as React from 'react';
import { View } from 'react-native';

import { useFormControlAria } from '@wcpos/components/form/aria';
import { FormDescription, FormItem, FormLabel } from '@wcpos/components/form/common';
import { cn } from '@wcpos/components/lib/utils';
import { QUICK_KEYS } from '@wcpos/components/price-keypad';

import { useT } from '../../../../contexts/translations';
import { AmountField, type AmountFieldHandle } from '../../components/amount-field';
import { ensureNumberArray } from './cells/ensure-number-array';

type Props = {
	/** As stored: the array, or a legacy comma list, read as the cart's keypads read it. */
	value: number[] | string | undefined;
	onChange: (next: number[]) => void;
	label: string;
	testID?: string;
};

/**
 * The Quick Discounts setting is the price keypad's own key row (Paul 2026-10-29, board B): one
 * slot per quick key, each reading the key as the cashier sees it and growing into the percent
 * keypad (native: the typed field, decision 16). Slot order is key order; a typed 0 empties a
 * slot, and the blanks are dropped from what is written.
 */
export function QuickDiscountKeys({ value, onChange, label, testID }: Props) {
	const t = useT();
	const [refused, setRefused] = React.useState(false);
	const slots = ensureNumberArray(value ?? []).slice(0, QUICK_KEYS);
	const description = refused
		? t('pos_cart.discount_percent_invalid')
		: slots.length
			? t('pos_cart.quick_discounts_help')
			: t('pos_cart.quick_discounts_none');
	const first = React.useRef<AmountFieldHandle>(null);
	const toggle = () => (first.current?.isFocused() ? first.current.blur() : first.current?.focus());
	const { itemNativeID, labelNativeID, ariaProps } = useFormControlAria({
		label,
		description,
		onLabelPress: toggle,
	});

	const write = (index: number, next: number | undefined) => {
		const keys = Array.from({ length: QUICK_KEYS }, (_, i) => (i === index ? next : slots[i]));
		setRefused(false);
		onChange(keys.filter((key): key is number => key !== undefined));
	};
	// The keypad types no minus, but native's typed field can.
	const commit = (index: number) => (next: number) => {
		if (next < 0 || next > 100) {
			setRefused(true);
			return false;
		}
		write(index, next);
	};

	return (
		<FormItem nativeID={itemNativeID}>
			<FormLabel nativeID={labelNativeID} onPress={toggle}>
				{label}
			</FormLabel>
			<View className="border-border bg-card h-12 flex-row overflow-hidden rounded-lg border">
				{Array.from({ length: QUICK_KEYS }, (_, i) => (
					<View key={i} className={cn('flex-1', i > 0 && 'border-border border-l')}>
						<AmountField
							ref={i === 0 ? first : undefined}
							{...ariaProps}
							aria-invalid={refused}
							kind="percent"
							look="key"
							value={slots[i]}
							onCommit={commit(i)}
							onRemove={() => write(i, undefined)}
							testID={testID && `${testID}-${i}`}
						/>
					</View>
				))}
			</View>
			<FormDescription className={cn(refused && 'text-bad')}>{description}</FormDescription>
		</FormItem>
	);
}
