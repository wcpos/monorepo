import * as React from 'react';

import { useFormControlAria } from './aria';
import { FormDescription, FormItem, FormLabel, FormMessage } from './common';
import { optionToFieldValue } from './option-value';

import type { FormItemProps } from './common';

/**
 * The two fields the body reads off a selection. `Select` and `Combobox` each export
 * their own `Option` — the select primitive's also admits `undefined`, the combobox's
 * carries an extra `item` payload — and both are assignable to this. The public prop
 * types below keep each control's own `Option`; only the shared body narrows to what
 * it actually touches.
 */
export interface OptionLike {
	value: string;
	label: string;
}

/**
 * Public props for a form field backed by an option control.
 *
 * Generic over the rendered control so that `customComponent` types the rest of the
 * props. A wrapper like `CustomerSelect` takes props `Combobox` has never heard of
 * (`withGuest`); before this was generic those props had no home in the type, which
 * is what drove `orders/edit/form.tsx` to `React.createElement(FormCombobox, {...} as never)`.
 *
 * Single-select: the field holds a scalar, converted to and from `Option` internally.
 * A caller whose label cannot be derived from the scalar — an id field whose label is
 * fetched separately, say — passes the pair straight through instead; the value memo
 * has always accepted that, the type just never said so.
 *
 * Multi-select: the field holds `Option[]`, passed through untouched.
 */
export type FormOptionFieldProps<TControl extends React.ElementType> = (
	| (Omit<FormItemProps<string | OptionLike>, 'customComponent'> & { multiple?: false })
	| (Omit<FormItemProps<OptionLike[]>, 'customComponent'> & { multiple: true })
) & { customComponent?: TControl } & Omit<
		Partial<React.ComponentProps<TControl>>,
		'value' | 'onValueChange' | 'multiple' | 'customComponent'
	>;

type FormOptionControlProps = {
	label?: string;
	description?: string;
	multiple?: boolean;
	value?: string | OptionLike | OptionLike[];
	onChange?: (value: string | OptionLike[]) => void;
	/** Rendered when the caller does not override the control via `customComponent`. */
	defaultComponent: React.ElementType<any>;
	customComponent?: React.ElementType<any>;
} & Record<string, any>;

/**
 * Shared body behind `FormSelect` and `FormCombobox`. The two differ only in which
 * control they default to — everything else here (the scalar/Option conversion, the
 * open state, the aria wiring, the label/description/message scaffold) was duplicated
 * line for line between them, and the one place they had quietly diverged was the
 * clear path (see `optionToFieldValue`).
 */
export function FormOptionControl({
	label,
	description,
	value,
	onChange,
	multiple,
	defaultComponent,
	customComponent: Component = defaultComponent,
	...props
}: FormOptionControlProps) {
	const [open, setOpen] = React.useState(false);
	const { labelNativeID, ariaProps } = useFormControlAria({ label, description });

	const controlValue = React.useMemo(() => {
		if (multiple) {
			return (value as OptionLike[] | undefined) ?? [];
		}
		return typeof value === 'string' ? { value, label: value } : value;
	}, [multiple, value]);

	const handleValueChange = React.useCallback(
		(val: OptionLike | OptionLike[] | undefined) => {
			if (multiple) {
				onChange?.((val as OptionLike[] | undefined) ?? []);
			} else {
				onChange?.(optionToFieldValue(val as OptionLike | undefined));
			}
		},
		[multiple, onChange]
	);

	return (
		<FormItem>
			{!!label && <FormLabel nativeID={labelNativeID}>{label}</FormLabel>}
			<Component
				{...ariaProps}
				open={open}
				onOpenChange={setOpen}
				multiple={multiple as any}
				value={controlValue as any}
				onValueChange={handleValueChange}
				{...props}
			/>
			{!!description && <FormDescription>{description}</FormDescription>}
			<FormMessage />
		</FormItem>
	);
}
