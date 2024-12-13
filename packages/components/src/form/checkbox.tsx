import * as React from 'react';
import { View } from 'react-native';

import { FormItem, FormLabel, FormDescription, FormMessage } from './common';
import { useFormField } from './context';
import { Checkbox } from '../checkbox';

import type { FormItemProps } from './common';

const FormCheckbox = React.forwardRef<
	React.ElementRef<typeof Checkbox>,
	Omit<FormItemProps<typeof Checkbox, boolean>, 'checked' | 'onCheckedChange'>
>(({ label, description, value, onChange, ...props }, ref) => {
	const { error, formItemNativeID, formDescriptionNativeID, formMessageNativeID } = useFormField();

	function handleOnLabelPress() {
		onChange?.(!value);
	}

	return (
		<FormItem className="px-1">
			<View className="flex-row items-center gap-3">
				<Checkbox
					ref={ref}
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
});

FormCheckbox.displayName = 'FormCheckbox';

export { FormCheckbox };
