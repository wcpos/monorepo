import React from 'react';
import { TextInputProps } from 'react-native';
import { Wrapper, Input, PrefixText } from './styles';
import Button from '../button';

export type Props = TextInputProps & {
	autosize?: boolean;
	placeholder?: string;
	action?: string;
	onAction?: (value?: string) => void;
	prefix?: string;
	value?: string;
};

const TextInput = ({ action, autosize, placeholder, onAction, prefix, ...props }: Props) => {
	const [value, setValue] = React.useState(props.value);

	const handleAction = () => {
		if (typeof onAction === 'function') {
			onAction(value);
		}
	};
	return (
		<Wrapper>
			{prefix && <PrefixText>{prefix}</PrefixText>}
			<Input placeholder={placeholder} value={value} onChangeText={setValue} />
			{action && <Button title={action} onPress={handleAction} />}
		</Wrapper>
	);
};

export default TextInput;
