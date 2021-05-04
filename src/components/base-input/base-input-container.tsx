import React from 'react';
import { View, TouchableWithoutFeedback } from 'react-native';
import InlineError from '../inline-error';
import Text from '../text';
import * as Styled from './styles';

export interface BaseInputContainerProps {
	/**
	 * Label shown above the input.
	 */
	label: string;
	/**
	 * Callback called on click of the label.
	 */
	onLabelClick: () => void;
	/**
	 * Additional text to help the user.
	 */
	helpText: React.ReactNode;
	/**
	 * Display an error state.
	 */
	error: boolean | string;
	/**
	 * Disable the input.
	 */
	disabled: boolean;
	/**
	 * TextInput component.
	 */
	children: React.ReactNode;
	/**
	 * Hides the label.
	 */
	hideLabel?: boolean;
}

/**
 * Wraps a basic Input field with label, helpText and error features.
 */
export const BaseInputContainer: React.FC<BaseInputContainerProps> = ({
	label,
	error,
	helpText,
	disabled,
	children,
	onLabelClick,
	hideLabel = false,
}) => (
	<Styled.Container>
		{!hideLabel && (
			<TouchableWithoutFeedback onPress={onLabelClick} disabled={disabled}>
				<View>
					<Styled.LabelContainer>
						<Text>{label}</Text>
					</Styled.LabelContainer>
				</View>
			</TouchableWithoutFeedback>
		)}

		{/* Actual Input goes here */}
		{children}

		{error ? (
			<Styled.MessageContainer>
				<InlineError message={typeof error === 'string' ? error : ''} />
			</Styled.MessageContainer>
		) : null}
		{helpText ? (
			<Styled.MessageContainer>
				<Text
				// variation="subdued"
				>
					{helpText}
				</Text>
			</Styled.MessageContainer>
		) : null}
	</Styled.Container>
);
