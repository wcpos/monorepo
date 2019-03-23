import React from 'react';
import { Wrapper, Input, PrefixText } from './styles';
import Button from '../button';

export type Props = import('react-native').TextInputProps & {
	autosize?: boolean;
	action?: string;
	onAction?: (value: string) => void;
	prefix?: string;
};

const TextInput = ({
	action,
	autosize,
	placeholder,
	onAction,
	prefix,
	keyboardType,
	...props
}: Props) => {
	const [value, setValue] = React.useState(props.value || '');

	const handleAction = () => {
		if (typeof onAction === 'function') {
			onAction(value);
		}
	};
	return (
		<Wrapper>
			{prefix && <PrefixText>{prefix}</PrefixText>}
			<Input
				placeholder={placeholder}
				value={value}
				onChangeText={setValue}
				keyboardType={keyboardType}
				autoCapitalize="none"
			/>
			{action && <Button title={action} onPress={handleAction} />}
		</Wrapper>
	);
};

export default TextInput;
