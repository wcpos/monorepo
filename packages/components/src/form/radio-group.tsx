import * as React from 'react';
import { View } from 'react-native';

import { FormDescription, FormItem, FormLabel, FormMessage } from './common';
import { useFormField } from './context';
import { RadioGroup } from '../radio-group';

import type { FormItemProps } from './common';

export function FormRadioGroup({
	label,
	description,
	value,
	onChange,
	onValueChange: _onValueChange,
	customComponent: Component = RadioGroup,
	...props
}: FormItemProps<string> & React.ComponentProps<typeof RadioGroup>) {
	const { error, formItemNativeID, formDescriptionNativeID, formMessageNativeID } = useFormField();

	return (
		<FormItem>
			<View>
				{!!label && <FormLabel nativeID={formItemNativeID}>{label}</FormLabel>}
				{!!description && <FormDescription className="pt-0">{description}</FormDescription>}
			</View>
			<Component
				aria-labelledby={formItemNativeID}
				aria-describedby={
					!error
						? `${formDescriptionNativeID}`
						: `${formDescriptionNativeID} ${formMessageNativeID}`
				}
				aria-invalid={!!error}
				onValueChange={onChange}
				value={value}
				{...props}
			/>

			<FormMessage />
		</FormItem>
	);
}
