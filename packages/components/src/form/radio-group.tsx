import * as React from 'react';
import { View } from 'react-native';

import { useFormControlAria } from './aria';
import { FormDescription, FormItem, FormLabel, FormMessage } from './common';
import { RadioGroup } from '../radio-group';

import type { FormItemProps } from './common';

export function FormRadioGroup({
	label,
	description,
	value,
	onChange,
	customComponent: Component = RadioGroup,
	...props
}: FormItemProps<string> &
	Omit<Partial<React.ComponentProps<typeof RadioGroup>>, 'value' | 'onValueChange'>) {
	const { labelNativeID, ariaProps } = useFormControlAria({ label, description });

	return (
		<FormItem>
			<View>
				{!!label && <FormLabel nativeID={labelNativeID}>{label}</FormLabel>}
				{!!description && <FormDescription className="pt-0">{description}</FormDescription>}
			</View>
			<Component {...ariaProps} onValueChange={onChange} value={value} {...props} />

			<FormMessage />
		</FormItem>
	);
}
