import * as React from 'react';

import { FormDescription, FormItem, FormLabel, FormMessage } from './common';
import { useFormField } from './context';
import { Tabs, TabsList, TabsTrigger } from '../tabs';
import { Text } from '../text';

import type { FormItemProps } from './common';

export interface FormToggleGroupOption {
	label: string;
	value: string;
}

/**
 * Single-select segmented control for react-hook-form, rendered in the app's
 * segmented Tabs style (see the printer connection-type control). Pressing the
 * selected item again is a no-op (a form field must always hold a value).
 */
export function FormToggleGroup({
	label,
	description,
	value,
	onChange,
	options,
	type: _type,
	testID,
	...props
}: FormItemProps<string> & { options: FormToggleGroupOption[]; testID?: string }) {
	const { error, formItemNativeID, formDescriptionNativeID, formMessageNativeID } = useFormField();

	return (
		<FormItem>
			{!!label && <FormLabel nativeID={formItemNativeID}>{label}</FormLabel>}
			<Tabs
				value={value ?? ''}
				onValueChange={(next: string) => {
					if (next && next !== value) {
						onChange?.(next);
					}
				}}
			>
				<TabsList
					testID={testID}
					aria-labelledby={formItemNativeID}
					aria-describedby={
						!error
							? `${formDescriptionNativeID}`
							: `${formDescriptionNativeID} ${formMessageNativeID}`
					}
					aria-invalid={!!error}
					className="w-full flex-row"
					{...props}
				>
					{options.map((option) => (
						<TabsTrigger
							key={option.value}
							value={option.value}
							label={option.label}
							testID={testID ? `${testID}-${option.value}` : undefined}
							className="flex-1"
						>
							<Text>{option.label}</Text>
						</TabsTrigger>
					))}
				</TabsList>
			</Tabs>
			{!!description && <FormDescription>{description}</FormDescription>}
			<FormMessage />
		</FormItem>
	);
}
