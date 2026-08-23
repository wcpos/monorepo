import * as React from 'react';
import { View } from 'react-native';

import { useFormControlAria } from './aria';
import { FormDescription, FormItem, FormLabel, FormMessage } from './common';
import { Checkbox } from '../checkbox';

import type { FormItemProps } from './common';

export function FormCheckbox({
	label,
	description,
	value,
	onChange,
	onCheckedChange: _onCheckedChange,
	checked: _checked,
	...props
}: FormItemProps<boolean> & Partial<React.ComponentProps<typeof Checkbox>>) {
	const { labelNativeID, ariaProps } = useFormControlAria({ label, description });

	function handleOnLabelPress() {
		onChange?.(!value);
	}

	return (
		<FormItem className="px-1">
			<View className="flex-row items-center gap-3">
				<Checkbox {...ariaProps} onCheckedChange={onChange} checked={value ?? false} {...props} />
				{!!label && (
					<FormLabel className="pb-0" nativeID={labelNativeID} onPress={handleOnLabelPress}>
						{label}
					</FormLabel>
				)}
			</View>
			{!!description && <FormDescription>{description}</FormDescription>}
			<FormMessage />
		</FormItem>
	);
}
