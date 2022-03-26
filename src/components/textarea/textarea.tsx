import * as React from 'react';
import TextInput, { TextInputProps } from '../textinput';

export interface TextAreaProps extends TextInputProps {
	numberOfLines?: number;
}

export const TextArea = ({ numberOfLines = 3, value, ...props }: TextAreaProps) => {
	return (
		<TextInput {...props} multiline numberOfLines={numberOfLines} editable={false} value={value} />
	);
};
