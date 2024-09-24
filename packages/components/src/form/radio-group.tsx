import * as React from 'react';
import { View } from 'react-native';

import { FormItem, FormLabel, FormDescription, FormMessage } from './common';
import { useFormField } from './context';
import { RadioGroup } from '../radio-group';

import type { FormItemProps } from './common';

const FormRadioGroup = React.forwardRef<
	React.ElementRef<typeof RadioGroup>,
	Omit<FormItemProps<typeof RadioGroup, string>, 'onValueChange'>
>(
	(
		{ label, description, value, onChange, customComponent: Component = RadioGroup, ...props },
		ref
	) => {
		const { error, formItemNativeID, formDescriptionNativeID, formMessageNativeID } =
			useFormField();

		return (
			<FormItem>
				<View>
					{!!label && <FormLabel nativeID={formItemNativeID}>{label}</FormLabel>}
					{!!description && <FormDescription className="pt-0">{description}</FormDescription>}
				</View>
				<Component
					ref={ref}
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
);

FormRadioGroup.displayName = 'FormRadioGroup';

export { FormRadioGroup };
