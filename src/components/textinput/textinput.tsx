import * as React from 'react';
import { View } from 'react-native';
import noop from 'lodash/noop';
import * as Styled from './styles';
import Button from '../button';
import Text from '../text';
import Icon from '../icon';
import Portal from '../portal';
import useMeasure from '../../hooks/use-measure';

export type Props = import('react-native').TextInputProps & {
	autosize?: boolean;
	disabled?: boolean;
	action?: string;
	clearable?: boolean;
	invalid?: boolean;
	onAction?: (value: string) => void;
	onClear?: () => void;
	prefix?: string;
};

const TextInput = ({
	action,
	autosize,
	clearable = false,
	disabled = false,
	invalid = false,
	placeholder,
	onAction = noop,
	onChangeText = noop,
	onClear = noop,
	prefix,
	value = '',
	...props
}: Props) => {
	const [text, setText] = React.useState(value);

	const handleChangeText = (val: string) => {
		setText(val);
		onChangeText(val);
	};

	const handleClear = () => {
		setText('');
	};

	const handleOnAction = () => {
		onAction(text);
	};

	return (
		<Styled.Box>
			<Styled.Input
				defaultValue={text}
				placeholder={placeholder}
				disabled={disabled}
				onChangeText={handleChangeText}
				{...props}
			/>
			{clearable && <Icon name="clear" />}
			{action && (
				<Button
					title={action}
					onPress={handleOnAction}
					style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
				/>
			)}
		</Styled.Box>
	);
};

export default TextInput;
