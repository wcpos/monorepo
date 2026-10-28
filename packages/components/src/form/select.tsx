import * as React from 'react';

import { useFormControlAria } from './aria';
import { FormDescription, FormItem, FormLabel, FormMessage } from './common';
import { OptionSelect } from '../select';

import type { FormItemProps } from './common';

export type FormSelectProps<TControl extends React.ElementType = typeof OptionSelect> = Omit<
	FormItemProps<string>,
	'customComponent'
> & { customComponent?: TControl } & Omit<
		Partial<React.ComponentProps<TControl>>,
		'value' | 'onChange' | 'customComponent'
	>;

/**
 * One string of a known list: `options` + `placeholder` draw an `OptionSelect` with the scalar,
 * never an Option. A list bound to store data is a control with the same props, passed as
 * `customComponent`. A value the list lacks shows itself rather than an empty box.
 */
export function FormSelect<TControl extends React.ElementType = typeof OptionSelect>({
	label,
	description,
	value,
	onChange,
	customComponent,
	...props
}: FormSelectProps<TControl>) {
	const { itemNativeID, labelNativeID, ariaProps } = useFormControlAria({ label, description });
	const Control: React.ElementType<any> = customComponent ?? OptionSelect;
	return (
		<FormItem nativeID={itemNativeID}>
			{!!label && <FormLabel nativeID={labelNativeID}>{label}</FormLabel>}
			<Control
				{...ariaProps}
				matchWidth
				fallbackLabel={value}
				{...props}
				value={value}
				// A clear is '' and never undefined: the patch's JSON would drop the key (line 5).
				onChange={(next: string | undefined) => onChange?.(next ?? '')}
			/>
			{!!description && <FormDescription>{description}</FormDescription>}
			<FormMessage />
		</FormItem>
	);
}
