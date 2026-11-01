import * as React from 'react';
import { View } from 'react-native';

import { useFormControlAria } from './aria';
import { focusFirstControl, FormDescription, FormItem, FormLabel, FormMessage } from './common';
import { SegmentedControl, type SegmentedControlHandle } from '../segmented-control';

import type { FormItemProps } from './common';

type Segments = React.ComponentProps<typeof SegmentedControl>['segments'];

/**
 * A react-hook-form field holding one of two to four values, drawn as the app's one
 * `SegmentedControl`. The control never lets the selected segment be pressed off, so the
 * field always holds a value. Each segment's testID defaults to `${testID}-${value}`.
 */
export function FormSegmentedControl({
	label,
	description,
	value,
	onChange,
	segments,
	disabled,
	testID,
	onBlur,
	ref,
}: FormItemProps<string> & { segments: Segments; testID?: string }) {
	const controlRef = React.useRef<React.ComponentRef<typeof View>>(null);
	const handleOnLabelPress = () => focusFirstControl(controlRef);
	const { itemNativeID, labelNativeID, ariaProps } = useFormControlAria({
		label,
		description,
		onLabelPress: handleOnLabelPress,
	});
	const drawn = segments.map((segment) => ({
		...segment,
		disabled: !!(disabled || segment.disabled),
		testID: segment.testID ?? (testID ? `${testID}-${segment.value}` : undefined),
	})) as unknown as Segments;

	return (
		<FormItem nativeID={itemNativeID}>
			{!!label && (
				<FormLabel nativeID={labelNativeID} onPress={handleOnLabelPress}>
					{label}
				</FormLabel>
			)}
			<View ref={controlRef}>
				<SegmentedControl
					segments={drawn}
					value={value ?? ''}
					onValueChange={(next) => onChange?.(next)}
					testID={testID}
					aria-disabled={!!disabled}
					// The controller's blur marks the field touched (focus leaving a segment bubbles
					// here); its ref gets the control's handle, whose focus() lands on the tab stop
					// segment, so focus-on-error reaches the field.
					onBlur={onBlur}
					ref={ref as React.Ref<SegmentedControlHandle>}
					{...ariaProps}
				/>
			</View>
			{!!description && <FormDescription>{description}</FormDescription>}
			<FormMessage />
		</FormItem>
	);
}
