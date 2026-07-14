import * as React from 'react';

import { FormDescription, FormItem, FormLabel, FormMessage } from './common';
import { useFormField } from './context';
import { Text } from '../text';
import { ToggleGroup, ToggleGroupItem } from '../toggle-group';

import type { FormItemProps } from './common';

export interface FormToggleGroupOption {
	label: string;
	value: string;
}

/**
 * Single-select segmented control for react-hook-form. Pressing the selected
 * item again is a no-op (a form field must always hold a value).
 */
export function FormToggleGroup({
	label,
	description,
	value,
	onChange,
	options,
	type: _type,
	...props
}: FormItemProps<string> & { options: FormToggleGroupOption[] }) {
	const { error, formItemNativeID, formDescriptionNativeID, formMessageNativeID } = useFormField();

	return (
		<FormItem>
			{!!label && <FormLabel nativeID={formItemNativeID}>{label}</FormLabel>}
			<ToggleGroup
				type="single"
				value={value}
				onValueChange={(next: string | undefined) => {
					if (next) {
						onChange?.(next);
					}
				}}
				aria-labelledby={formItemNativeID}
				aria-describedby={
					!error
						? `${formDescriptionNativeID}`
						: `${formDescriptionNativeID} ${formMessageNativeID}`
				}
				aria-invalid={!!error}
				className="w-full"
				{...props}
			>
				{options.map((option) => (
					<ToggleGroupItem key={option.value} value={option.value} className="flex-1">
						<Text>{option.label}</Text>
					</ToggleGroupItem>
				))}
			</ToggleGroup>
			{!!description && <FormDescription>{description}</FormDescription>}
			<FormMessage />
		</FormItem>
	);
}
