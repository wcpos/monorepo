import * as React from 'react';
import { View } from 'react-native';

import { FormDescription, FormItem, FormLabel, FormMessage } from './common';
import { useFormField } from './context';
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
}: FormItemProps<boolean> & React.ComponentProps<typeof Checkbox>) {
	const { error, formItemNativeID, formDescriptionNativeID, formMessageNativeID } = useFormField();

	function handleOnLabelPress() {
		onChange?.(!value);
	}

	return (
		<FormItem className="px-1">
			<View className="flex-row items-center gap-3">
				<Checkbox
					aria-labelledby={formItemNativeID}
					aria-describedby={
						!error
							? `${formDescriptionNativeID}`
							: `${formDescriptionNativeID} ${formMessageNativeID}`
					}
					aria-invalid={!!error}
					onCheckedChange={onChange}
					checked={value}
					{...props}
				/>
				{!!label && (
					<FormLabel className="pb-0" nativeID={formItemNativeID} onPress={handleOnLabelPress}>
						{label}
					</FormLabel>
				)}
			</View>
			{!!description && <FormDescription>{description}</FormDescription>}
			<FormMessage />
		</FormItem>
	);
}
