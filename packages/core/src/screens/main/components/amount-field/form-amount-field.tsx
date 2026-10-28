import * as React from 'react';

import { useFormControlAria } from '@wcpos/components/form/aria';
import { FormItem, FormLabel, FormMessage } from '@wcpos/components/form/common';

import { AmountField } from './amount-field';

import type { AmountFieldHandle, AmountFieldProps } from './types';

type Props = Omit<AmountFieldProps, 'onCommit' | 'ref'> & {
	onChange: (value: number | string | null) => void;
	ref?: React.Ref<unknown>;
	label?: string;
	/** Each readable draft as typed, for a form that acts only on its verb (a tap does not blur). */
	live?: boolean;
};

/** A form's amount with its label, aria and message; a form holding text gets text. */
export function FormAmountField({ value, onChange, ref, label, live, ...props }: Props) {
	const field = React.useRef<AmountFieldHandle>(null);
	const toggle = () => (field.current?.isFocused() ? field.current.blur() : field.current?.focus());
	const { itemNativeID, labelNativeID, ariaProps } = useFormControlAria({
		label,
		onLabelPress: toggle,
	});
	// At mount: a live draft can leave a null, which says nothing of the form's type.
	const asText = React.useRef(typeof value === 'string');
	const toForm = (next: number) => onChange(asText.current ? String(next) : next);
	// Unreadable is null, which every live form's schema refuses, so its verb cannot act on it.
	const toDraft = (next: number | null | undefined) =>
		next == null ? onChange(next === null ? null : '') : toForm(next);
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
				onDraftChange={live ? toDraft : undefined}
			/>
			<FormMessage />
		</FormItem>
	);
}
