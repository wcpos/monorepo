import React from 'react';
import Pressable from '../pressable';
import Text from '../text';

export interface BaseInputProps {
	value: string;
	placeholder?: string;
	onPress: () => void;
	focused: boolean;
	disabled: boolean;
}

/**
 * Gives the look of a basic Input component. Use for components that look like a `TextField` but are not.
 */
export const BaseInput = ({ value, placeholder, onPress, focused, disabled }: BaseInputProps) => {
	// const styles = useStyles((theme) => ({
	// 	// Base Styles
	// 	inputContainer: {
	// 		flexDirection: 'row',
	// 		backgroundColor: theme.colors.fill.background.lighter,
	// 		borderColor: theme.colors.fill.primary.default,
	// 		borderWidth: theme.border.small,
	// 		borderRadius: theme.radius.medium,
	// 		height: 40, // Need to enforce height for iOS.
	// 		paddingHorizontal: theme.spacing.medium,
	// 		paddingVertical: theme.spacing.small - theme.border.small,
	// 		alignItems: 'center',
	// 	},

	// 	// Focused Styles
	// 	inputContainerFocused: {
	// 		borderColor: theme.colors.fill.primary.default,
	// 	},

	// 	// Disabled Styles
	// 	inputContainerDisabled: {
	// 		opacity: theme.opacity.disabled,
	// 	},
	// }));
	const showPlaceholder = !value || value.length === 0;

	return (
		<Pressable
			// viewStyle={[
			// 	styles.inputContainer,
			// 	focused && styles.inputContainerFocused,
			// 	disabled && styles.inputContainerDisabled,
			// ]}
			onPress={onPress}
			disabled={disabled}
		>
			<Text
			// maxLines={1}
			// variation={showPlaceholder ? 'subdued' : undefined}
			>
				{showPlaceholder ? placeholder : value}
			</Text>
		</Pressable>
	);
};
