import * as React from 'react';
import {
	PressableStateCallbackType,
	Pressable as RNPressable,
	StyleProp,
	View,
	ViewStyle,
} from 'react-native';

export type PressableProps = import('react-native').PressableProps & {
	onHoverIn?: () => void;
	onHoverOut?: () => void;
	ref?: React.Ref<View>;
};

/**
 *
 */
function Pressable({ ref, style, ...rest }: PressableProps) {
	const resolvedStyle = React.useCallback(
		(state: PressableStateCallbackType) => {
			let finalStyle: StyleProp<ViewStyle> = [];

			if (typeof style === 'function') {
				const dynamicStyle = style(state);
				finalStyle = [dynamicStyle, { flexDirection: 'row' }];
			} else {
				finalStyle = [{ flexDirection: 'row' }, style];
			}

			return finalStyle;
		},
		[style]
	);

	return <RNPressable style={resolvedStyle} ref={ref} {...rest} />;
}

Pressable.displayName = 'Pressable';

export { Pressable };
