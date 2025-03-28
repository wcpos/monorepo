import * as React from 'react';
import { View } from 'react-native';

import { FormItem, FormLabel, FormDescription, FormMessage } from './common';
import { useFormField } from './context';
import { Switch } from '../switch';

import type { FormItemProps } from './common';

const FormSwitch = React.forwardRef<
	React.ElementRef<typeof Switch>,
	Omit<FormItemProps<typeof Switch, boolean>, 'checked' | 'onCheckedChange'>
>(({ label, description, value, onChange, ...props }, ref) => {
	const switchRef = React.useRef<React.ComponentRef<typeof Switch>>(null);
	const { error, formItemNativeID, formDescriptionNativeID, formMessageNativeID } = useFormField();

	React.useImperativeHandle(ref, () => {
		if (!switchRef.current) {
			return {} as React.ComponentRef<typeof Switch>;
		}
		return switchRef.current;
	}, [switchRef.current]);

	function handleOnLabelPress() {
		onChange?.(!value);
	}

	return (
		<FormItem className="px-1">
			<View className="w-full flex-row items-center gap-3">
				<Switch
					ref={switchRef}
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
					<FormLabel className="grow pb-0" nativeID={formItemNativeID} onPress={handleOnLabelPress}>
						{label}
					</FormLabel>
				)}
			</View>
			{!!description && <FormDescription>{description}</FormDescription>}
			<FormMessage />
		</FormItem>
	);
});

FormSwitch.displayName = 'FormSwitch';

export { FormSwitch };
