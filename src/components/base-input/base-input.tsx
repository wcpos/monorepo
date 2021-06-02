import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import * as Styled from './styles';

export interface BaseInputProps {
	value: string;
	placeholder?: string;
	onPress: () => void;
	focused: boolean;
	disabled: boolean;
	/**
	 * Adds functionality to the TextInput, eg: buttons, tags
	 */
	leftAccessory?: React.ReactNode;
	/**
	 * Adds functionality to the TextInput, eg: buttons, tags
	 */
	rightAccessory?: React.ReactNode;
	/**
	 * Styles for the textinput container
	 */
	style?: StyleProp<ViewStyle>;
}

/**
 * Gives the look of a basic Input component. Use for components that look like a `TextField` but are not.
 */
export const BaseInput = ({
	value,
	placeholder,
	onPress,
	focused,
	disabled,
	leftAccessory,
	rightAccessory,
	style,
}: BaseInputProps) => {
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
		<Styled.Box
			// viewStyle={[
			// 	styles.inputContainer,
			// 	focused && styles.inputContainerFocused,
			// 	disabled && styles.inputContainerDisabled,
			// ]}
			onPress={onPress}
			disabled={disabled}
			style={style}
		>
			{leftAccessory}
			<Styled.InputText
				// maxLines={1}
				type={showPlaceholder ? 'secondary' : undefined}
			>
				{showPlaceholder ? placeholder : value}
			</Styled.InputText>
			{rightAccessory}
		</Styled.Box>
	);
};
