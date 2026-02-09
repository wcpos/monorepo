import * as React from 'react';
import { View } from 'react-native';

import { FormDescription, FormItem, FormLabel, FormMessage } from './common';
import { useFormField } from './context';
import { Switch } from '../switch';

import type { FormItemProps } from './common';

export function FormSwitch({
	label,
	description,
	value,
	onChange,
	onCheckedChange: _onCheckedChange,
	checked: _checked,
	ref,
	...props
}: FormItemProps<boolean> & React.ComponentProps<typeof Switch>) {
	const switchRef = React.useRef<React.ComponentRef<typeof Switch>>(null);
	const { error, formItemNativeID, formDescriptionNativeID, formMessageNativeID } = useFormField();

	React.useImperativeHandle(ref, () => {
		if (!switchRef.current) {
			return {} as React.ComponentRef<typeof Switch>;
		}
		return switchRef.current;
	}, []);

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
					<FormLabel className="grow" nativeID={formItemNativeID} onPress={handleOnLabelPress}>
						{label}
					</FormLabel>
				)}
			</View>
			{!!description && <FormDescription>{description}</FormDescription>}
			<FormMessage />
		</FormItem>
	);
}
