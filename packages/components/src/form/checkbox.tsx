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
	const { itemNativeID, labelNativeID, ariaProps } = useFormControlAria({
		label,
		description,
		onLabelPress: handleOnLabelPress,
	});

	function handleOnLabelPress() {
		onChange?.(!value);
	}

	return (
		// No side padding: the box's left edge is the column's, as a form switch's is.
		<FormItem nativeID={itemNativeID}>
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
