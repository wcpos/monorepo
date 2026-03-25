import * as React from 'react';

import { FormDescription, FormItem, FormLabel, FormMessage } from './common';
import { useFormField } from './context';
import { Option, Select } from '../select';

import type { FormItemProps } from './common';

/**
 * Single-select: value is a string, converted to/from Option internally.
 * Multi-select: value is Option[], passed through directly.
 */
type FormSelectProps = (
	| (FormItemProps<string> & { multiple?: false })
	| (FormItemProps<Option[]> & { multiple: true })
) &
	Omit<Partial<React.ComponentProps<typeof Select>>, 'value' | 'onValueChange' | 'multiple'>;

export function FormSelect({
	label,
	description,
	onChange,
	value,
	multiple,
	customComponent: Component = Select,
	...props
}: FormSelectProps) {
	const [open, setOpen] = React.useState(false);
	const { error, formItemNativeID, formDescriptionNativeID, formMessageNativeID } = useFormField();

	const selectValue = React.useMemo(() => {
		if (multiple) {
			return (value as Option[] | undefined) ?? [];
		}
		return typeof value === 'string' ? { value, label: value } : value;
	}, [multiple, value]);

	const handleValueChange = React.useCallback(
		(val: any) => {
			if (multiple) {
				onChange?.(val ?? []);
			} else {
				onChange?.(val?.value || '');
			}
		},
		[multiple, onChange]
	);

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
				multiple={multiple as any}
				value={selectValue as any}
				onValueChange={handleValueChange}
				{...props}
			/>
			{!!description && <FormDescription>{description}</FormDescription>}
			<FormMessage />
		</FormItem>
	);
}
