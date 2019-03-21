import React from 'react';
import { TextInputProps } from 'react-native';
import { Wrapper, Input } from './styles';

export type Props = TextInputProps & {
	autosize?: boolean;
	placeholder?: string;
};

const TextInput = ({ autosize, placeholder }: Props) => {
	return (
		<Wrapper>
			<Input placeholder={placeholder} />
		</Wrapper>
	);
};

export default TextInput;
