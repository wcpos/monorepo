import * as React from 'react';

import { useFormControlAria } from '@wcpos/components/form/aria';
import { FormItem, FormLabel, FormMessage } from '@wcpos/components/form/common';

import { AmountField } from './amount-field';

import type { AmountFieldHandle, AmountFieldProps } from './types';

/** A react-hook-form field (`{...field}`), plus the field's own props. */
type Props = Omit<AmountFieldProps, 'onCommit' | 'ref'> & {
	onChange: (value: number | string) => void;
	ref?: React.Ref<unknown>;
	label?: string;
	/** Each readable draft as typed, for a form that acts only on its verb (a tap does not blur). */
	live?: boolean;
};

/**
 * A form's amount, with its label, aria and message. The form gets the committed number, as
 * text when it holds the amount as text (WooCommerce's strings).
 */
export function FormAmountField({ value, onChange, ref, label, live, ...props }: Props) {
	const field = React.useRef<AmountFieldHandle>(null);
	const toggle = () => (field.current?.isFocused() ? field.current.blur() : field.current?.focus());
	const { itemNativeID, labelNativeID, ariaProps } = useFormControlAria({
		label,
		onLabelPress: toggle,
	});
	const toForm = (next: number) => onChange(typeof value === 'string' ? String(next) : next);
	React.useImperativeHandle(ref, () => field.current);
	return (
		<FormItem nativeID={itemNativeID}>
			{!!label && (
				<FormLabel nativeID={labelNativeID} onPress={toggle}>
					{label}
				</FormLabel>
			)}
			<AmountField
				ref={field}
				{...ariaProps}
				{...props}
				value={value}
				onCommit={toForm}
				onDraftChange={live ? toForm : undefined}
			/>
			<FormMessage />
		</FormItem>
	);
}
