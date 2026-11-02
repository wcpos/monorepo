import * as React from 'react';
import { View } from 'react-native';
import type { ViewProps } from 'react-native';

import * as LabelPrimitive from '@rn-primitives/label';

import { cn } from '../lib/utils';

/** react-native-web forwards `onClick` to the DOM; React Native's types do not list it. */
const WebRoot = View as React.ComponentType<
	ViewProps & { onClick?: (event: React.MouseEvent) => void }
>;

/**
 * Web: the root is a real `<label>` (react-native-web renders `accessibilityRole="label"`
 * as one), not the native side's Pressable. On web a Pressable is a `tabindex="0"` div,
 * so every form label was a Tab stop between fields. A `<label>` is clickable and read
 * by screen readers but never takes focus; its text keeps the `nativeID` the control's
 * `aria-labelledby` points at. `onPress` becomes the click, so pressing a label still
 * focuses or toggles the control beside it. The press phases have no web caller.
 */
function Label({
	className,
	onPress,
	onLongPress: _onLongPress,
	onPressIn: _onPressIn,
	onPressOut: _onPressOut,
	htmlFor,
	...props
}: LabelPrimitive.TextProps) {
	const textClassName =
		'web:peer-disabled:cursor-not-allowed web:peer-disabled:opacity-45 text-muted-foreground text-sm leading-none font-medium';
	// With `htmlFor` the primitive's Text is itself the `<label for>`; a second one around it
	// would be a label inside a label, so the text stands alone and takes the press itself.
	if (htmlFor) {
		return (
			<LabelPrimitive.Text
				className={cn(textClassName, className)}
				htmlFor={htmlFor}
				onPress={onPress}
				{...props}
			/>
		);
	}
	return (
		<WebRoot
			accessibilityRole="label"
			// A React mouse event carries `nativeEvent`, which is what an `onPress` caller may read.
			onClick={onPress ? (event) => onPress(event as never) : undefined}
			className={cn('web:cursor-default', className)}
		>
			<LabelPrimitive.Text className={textClassName} {...props} />
		</WebRoot>
	);
}

export { Label };
