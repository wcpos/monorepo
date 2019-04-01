import React from 'react';
import { Wrapper, Input, PrefixText } from './styles';
import Button from '../button';
import Text from '../text';

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

	const renderPrefix = () =>
		typeof prefix === 'string' ? <Text type="secondary">{prefix}</Text> : prefix;

	return (
		<Wrapper>
			{prefix && renderPrefix()}
			<Input
				placeholder={placeholder}
				value={value}
				onChangeText={setValue}
				keyboardType={keyboardType}
				autoCapitalize="none"
			/>
			{action && (
				<Button
					title={action}
					onPress={handleAction}
					style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
				/>
			)}
		</Wrapper>
	);
};

export default TextInput;
