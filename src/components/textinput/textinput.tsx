import React from 'react';
import { Wrapper, Input, PrefixText } from './styles';
import Button from '../button';
import Text from '../text';
import Icon from '../icon';

export type Props = import('react-native').TextInputProps & {
	autosize?: boolean;
	action?: string;
	cancellable?: boolean;
	onAction?: (value: string) => void;
	prefix?: string;
};

const TextInput = ({
	action,
	autosize,
	cancellable = false,
	placeholder,
	onAction,
	prefix,
	keyboardType,
	...props
}: Props) => {
	const [value, setValue] = React.useState(props.value || '');

	const clearText = () => {
		setValue('');
	};

	const handleAction = () => {
		if (typeof onAction === 'function') {
			onAction(value);
		}
	};

	const renderPrefix = () =>
		typeof prefix === 'string' ? <Text type="secondary">{prefix}</Text> : prefix;

	const renderCancelIcon = () => <Icon name="clear" onPress={clearText} />;

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
			{cancellable && value.length > 0 && renderCancelIcon()}
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
