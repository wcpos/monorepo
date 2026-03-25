import * as React from 'react';

import { FormDescription, FormItem, FormLabel, FormMessage } from './common';
import { useFormField } from './context';
import { Combobox } from '../combobox';

import type { Option } from '../combobox';
import type { FormItemProps } from './common';

/**
 * Single-select: value is a string, converted to/from Option internally.
 * Multi-select: value is Option[], passed through directly.
 */
type FormComboboxProps = (
	| (FormItemProps<string> & { multiple?: false })
	| (FormItemProps<Option[]> & { multiple: true })
) &
	Omit<Partial<React.ComponentProps<typeof Combobox>>, 'value' | 'onValueChange' | 'multiple'>;

export function FormCombobox({
	label,
	description,
	value,
	onChange,
	multiple,
	customComponent: Component = Combobox,
	...props
}: FormComboboxProps) {
	const [open, setOpen] = React.useState(false);
	const { error, formItemNativeID, formDescriptionNativeID, formMessageNativeID } = useFormField();

	const comboboxValue = React.useMemo(() => {
		if (multiple) {
			return (value as Option[] | undefined) ?? [];
		}
		return typeof value === 'string' ? { value, label: value } : value;
	}, [multiple, value]);

	const handleValueChange = React.useCallback(
		(val: Option | Option[] | undefined) => {
			if (multiple) {
				onChange?.((val as Option[] | undefined) ?? []);
			} else {
				onChange?.((val as Option | undefined)?.value);
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
				value={comboboxValue as any}
				onValueChange={handleValueChange}
				{...props}
			/>
			{!!description && <FormDescription>{description}</FormDescription>}
			<FormMessage />
		</FormItem>
	);
}
