import React from 'react';
import { TouchableWithoutFeedback } from 'react-native';
import InlineError from '../inline-error';
import Text from '../text';
import Box from '../box';

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
export const BaseInputContainer = ({
	label,
	error,
	helpText,
	disabled,
	children,
	onLabelClick,
	hideLabel = false,
}: BaseInputContainerProps) => (
	<Box space="xSmall">
		{!hideLabel && (
			<TouchableWithoutFeedback onPress={onLabelClick} disabled={disabled}>
				<Box>
					<Text>{label}</Text>
				</Box>
			</TouchableWithoutFeedback>
		)}

		{/* Actual Input goes here */}
		{children}

		{error ? (
			<Box>
				<InlineError message={typeof error === 'string' ? error : ''} />
			</Box>
		) : null}

		{helpText ? (
			<Box>
				<Text type="secondary" size="small">
					{helpText}
				</Text>
			</Box>
		) : null}
	</Box>
);
