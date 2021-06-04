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
	const showPlaceholder = !value || value.length === 0;

	// const renderLeftAccessory = leftAccessory && 

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
