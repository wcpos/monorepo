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
};

/**
 *
 */
export const Pressable = React.forwardRef<View, PressableProps>((props, ref) => {
	const { style, ...rest } = props;

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
});
