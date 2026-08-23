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
 * Single-select only. The field holds a scalar, converted to and from `Option`
 * internally. A caller whose label cannot be derived from the scalar — an id field
 * whose label is fetched separately, say — passes the pair straight through instead.
 *
 * There is deliberately no multi-select branch. `multiple` stays in the `Omit` below so
 * a caller cannot smuggle it through to the control and silently break the scalar value
 * contract. Multi-select goes through the raw `Combobox`/`TreeCombobox` (see
 * `meta-data-keys-field.tsx`, `category-pill.tsx`) or `FormTreeCombobox`, which is
 * built for it.
 */
export type FormOptionFieldProps<TControl extends React.ElementType> = Omit<
	FormItemProps<string | OptionLike>,
	'customComponent'
> & { customComponent?: TControl } & Omit<
		Partial<React.ComponentProps<TControl>>,
		'value' | 'onValueChange' | 'multiple' | 'customComponent'
	>;

/**
 * The body's own contract, generic over the rendered control exactly as the public
 * wrappers are, so the value/onChange agreement is checked at the wrapper-to-body seam
 * rather than erased by a cast on the way in.
 */
type FormOptionControlProps<TControl extends React.ElementType> = FormOptionFieldProps<TControl> & {
	/** Rendered when the caller does not override the control via `customComponent`. */
	defaultComponent: React.ElementType;
};

/**
 * Shared body behind `FormSelect` and `FormCombobox`. The two differ only in which
 * control they default to — everything else here (the scalar/Option conversion, the
 * open state, the aria wiring, the label/description/message scaffold) was duplicated
 * line for line between them, and the one place they had quietly diverged was the
 * clear path (see `optionToFieldValue`).
 */
export function FormOptionControl<TControl extends React.ElementType>({
	label,
	description,
	value,
	onChange,
	defaultComponent,
	customComponent,
	...props
}: FormOptionControlProps<TControl>) {
	const [open, setOpen] = React.useState(false);
	const { labelNativeID, ariaProps } = useFormControlAria({ label, description });

	/**
	 * The control is chosen at runtime, so its props cannot be resolved statically here.
	 * `ElementType<any>` is what admits the spread below; the caller-facing contract that
	 * matters — which props this control accepts — is enforced on `FormOptionFieldProps`,
	 * where `TControl` is bound to the concrete component.
	 */
	const Component: React.ElementType<any> = customComponent ?? defaultComponent;

	const controlValue = React.useMemo(
		() => (typeof value === 'string' ? { value, label: value } : value),
		[value]
	);

	const handleValueChange = React.useCallback(
		(val: OptionLike | undefined) => {
			onChange?.(optionToFieldValue(val));
		},
		[onChange]
	);

	return (
		<FormItem>
			{!!label && <FormLabel nativeID={labelNativeID}>{label}</FormLabel>}
			<Component
				{...ariaProps}
				open={open}
				onOpenChange={setOpen}
				value={controlValue}
				onValueChange={handleValueChange}
				{...props}
			/>
			{!!description && <FormDescription>{description}</FormDescription>}
			<FormMessage />
		</FormItem>
	);
}
