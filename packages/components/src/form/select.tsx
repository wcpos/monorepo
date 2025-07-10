import * as React from 'react';

import { FormDescription, FormItem, FormLabel, FormMessage } from './common';
import { useFormField } from './context';
import { Option, Select } from '../select';

import type { FormItemProps } from './common';

/**
 * NOTE: select is a bit different from the other form components
 * - the value will come in as a string and go out as a string, but
 * - the select component expects an object with value and label
 */
export function FormSelect({
	label,
	description,
	onChange,
	value,
	customComponent: Component = Select,
	...props
}: FormItemProps<string> & React.ComponentProps<typeof Select>) {
	const [open, setOpen] = React.useState(false);
	const { error, formItemNativeID, formDescriptionNativeID, formMessageNativeID } = useFormField();

	return (
		<FormItem>
			{!!label && <FormLabel nativeID={formItemNativeID}>{label}</FormLabel>}
			<Component
				aria-labelledby={formItemNativeID}
				aria-describedby={
					!error
						? `${formDescriptionNativeID}`
						: `${formDescriptionNativeID} ${formMessageNativeID}`
				}
				aria-invalid={!!error}
				open={open}
				onOpenChange={setOpen}
				value={typeof value === 'string' ? { value, label: value } : value}
				onValueChange={(val: Option) => onChange?.(val?.value || '')}
				{...props}
			/>
			{!!description && <FormDescription>{description}</FormDescription>}
			<FormMessage />
		</FormItem>
	);
}
