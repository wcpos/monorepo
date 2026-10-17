import * as React from 'react';

import { useFormControlAria } from './aria';
import { FormDescription, FormItem, FormLabel, FormMessage } from './common';
import { SegmentedControl } from '../segmented-control';

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
}: FormItemProps<string> & { segments: Segments; testID?: string }) {
	const { labelNativeID, ariaProps } = useFormControlAria({ label, description });
	const drawn = segments.map((segment) => ({
		...segment,
		disabled: !!(disabled || segment.disabled),
		testID: segment.testID ?? (testID ? `${testID}-${segment.value}` : undefined),
	})) as unknown as Segments;

	return (
		<FormItem>
			{!!label && <FormLabel nativeID={labelNativeID}>{label}</FormLabel>}
			<SegmentedControl
				segments={drawn}
				value={value ?? ''}
				onValueChange={(next) => onChange?.(next)}
				testID={testID}
				aria-disabled={!!disabled}
				{...ariaProps}
			/>
			{!!description && <FormDescription>{description}</FormDescription>}
			<FormMessage />
		</FormItem>
	);
}
