import React from 'react';
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
	value,
	...props
}: Props): React.ReactElement => {
	const handleClear = () => {
		console.log('hi');
	};

	return (
		<Styled.Box>
			<Styled.Input
				value={value}
				placeholder={placeholder}
				disabled={disabled}
				onChangeText={onChangeText}
				{...props}
			/>
			<Icon name="clear" onPress={handleClear} />
		</Styled.Box>
	);
};

export default TextInput;
