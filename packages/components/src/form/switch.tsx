import * as React from 'react';
import { View } from 'react-native';

import { useFormControlAria } from './aria';
import { FormDescription, FormItem, FormLabel, FormMessage } from './common';
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
}: FormItemProps<boolean> & Partial<React.ComponentProps<typeof Switch>>) {
	const switchRef = React.useRef<React.ComponentRef<typeof Switch>>(null);
	const { itemNativeID, labelNativeID, ariaProps } = useFormControlAria({
		label,
		description,
		onLabelPress: handleOnLabelPress,
	});

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
		// No side padding: the switch's left edge is the column's, where the other fields and the
		// labels above it start.
		<FormItem nativeID={itemNativeID}>
			{/* No row floor: stacked switches keep the web pitch. Their 44 pt squares may overlap
			    by a few points in the gap between two tracks, where the later row wins; each
			    square still covers its own track. */}
			<View className="w-full flex-row items-center gap-3">
				<Switch
					ref={switchRef}
					{...ariaProps}
					onCheckedChange={onChange}
					checked={value ?? false}
					{...props}
				/>
				{!!label && (
					<FormLabel className="grow" nativeID={labelNativeID} onPress={handleOnLabelPress}>
						{label}
					</FormLabel>
				)}
			</View>
			{!!description && <FormDescription>{description}</FormDescription>}
			<FormMessage />
		</FormItem>
	);
}
