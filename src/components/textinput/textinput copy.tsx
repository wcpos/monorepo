import React from 'react';
import { View } from 'react-native';
import { Wrapper, Input, PrefixText } from './styles';
import Button from '../button';
import Text from '../text';
import Icon from '../icon';
import Portal from '../portal';
import useMeasure from '../../hooks/use-measure';

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
	onChangeText,
	prefix,
	keyboardType,
	...props
}: Props): React.ReactElement => {
	const [value, setValue] = React.useState(props.value || '');
	// const ref = React.useRef<View>(null);
	// const [measurements, onMeasure] = React.useState({
	// 	height: 0,
	// 	pageX: 0,
	// 	pageY: 0,
	// 	width: 0,
	// 	x: 0,
	// 	y: 0,
	// });
	// const { onLayout } = useMeasure({ onMeasure, ref });

	const handleChangeText = (newValue: string) => {
		setValue(newValue);
		if (typeof onChangeText === 'function') {
			onChangeText(value);
		}
	};

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

	const onFocus = (args) => {
		console.log(args);
	};

	const onBlur = (args) => {
		console.log(args);
	};

	// if (autosize) {
	// 	const key = Portal.add(
	// 		<View ref={ref} onLayout={onLayout}>
	// 			<Text>{placeholder}</Text>
	// 		</View>
	// 	);
	// 	console.log(key);
	// }
	// console.log(measurements);
	return (
		<Wrapper>
			{prefix && renderPrefix()}
			<Input
				placeholder={placeholder}
				value={value}
				onChangeText={handleChangeText}
				keyboardType={keyboardType}
				autoCapitalize="none"
				onFocus={onFocus}
				onBlur={onBlur}
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
