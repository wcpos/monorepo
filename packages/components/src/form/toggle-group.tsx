import * as React from 'react';

import { FormDescription, FormItem, FormLabel, FormMessage } from './common';
import { useFormField } from './context';
import { cn } from '../lib/utils';
import { Text } from '../text';
import { ToggleGroup, ToggleGroupItem } from '../toggle-group';

import type { FormItemProps } from './common';

export interface FormToggleGroupOption {
	label: string;
	value: string;
}

/**
 * Single-select segmented control for react-hook-form, styled to match the
 * app's segmented Tabs look (see the printer connection-type control) while
 * keeping ToggleGroup selection semantics for assistive technology. Pressing
 * the selected item again is a no-op (a form field must always hold a value).
 */
export function FormToggleGroup({
	label,
	description,
	value,
	onChange,
	options,
	disabled,
	type: _type,
	testID,
	...props
}: FormItemProps<string> & { options: FormToggleGroupOption[]; testID?: string }) {
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
				disabled={disabled}
				testID={testID}
				aria-labelledby={formItemNativeID}
				aria-describedby={
					!error
						? `${formDescriptionNativeID}`
						: `${formDescriptionNativeID} ${formMessageNativeID}`
				}
				aria-invalid={!!error}
				className="bg-muted w-full rounded-md border-0 p-1"
				{...props}
			>
				{options.map((option) => {
					const isSelected = option.value === value;
					return (
						<ToggleGroupItem
							key={option.value}
							value={option.value}
							disabled={disabled}
							testID={testID ? `${testID}-${option.value}` : undefined}
							className={cn(
								'native:h-auto h-auto flex-1 rounded-md border-r-0 px-3 py-1.5',
								isSelected && 'bg-primary web:hover:bg-primary active:bg-primary shadow-sm'
							)}
						>
							<Text
								className={cn(
									'text-center text-sm font-normal',
									isSelected ? 'text-primary-foreground' : 'text-muted-foreground'
								)}
							>
								{option.label}
							</Text>
						</ToggleGroupItem>
					);
				})}
			</ToggleGroup>
			{!!description && <FormDescription>{description}</FormDescription>}
			<FormMessage />
		</FormItem>
	);
}
