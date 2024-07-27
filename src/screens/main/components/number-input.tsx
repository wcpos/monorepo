import * as React from 'react';
import { StyleProp, ViewStyle } from 'react-native';

import { useObservableEagerState } from 'observable-hooks';

import { Button, ButtonText } from '@wcpos/tailwind/src/button';
import { Numpad } from '@wcpos/tailwind/src/numpad';
import { Popover, PopoverContent, PopoverTrigger } from '@wcpos/tailwind/src/popover';

import { useAppState } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';
import { useCurrencyFormat } from '../hooks/use-currency-format';

interface NumberInputProps {
	/**  */
	value: string;

	/**  */
	onChange: (value: string) => void;

	/**  */
	disabled?: boolean;

	/**  */
	showDecimals?: boolean;

	/**  */
	showDiscounts?: number[];
	/**
	 *
	 */
	leftAccessory?: React.ReactNode;
	/**
	 *
	 */
	prefix?: string;
	/**
	 *
	 */
	rightAccessory?: React.ReactNode;

	/** */
	size?: import('@wcpos/themes').FontSizeTypes;

	/** */
	placement?: PopoverProps['placement'];

	/** */
	style?: StyleProp<ViewStyle>;
}

/**
 * Note: value comes in as decimalSeparator = '.' we need to convert it to the correct decimal separator
 * @TODO - We need a format helper numbers, not just currency, eg: quantity: 1,000.01
 */
const NumberInput = ({
	value = '0',
	onChange,
	disabled,
	showDecimals = false,
	showDiscounts,
	leftAccessory,
	prefix,
	rightAccessory,
	size = 'normal',
	placement = 'bottom',
	style,
}: NumberInputProps) => {
	const { store } = useAppState();
	const decimalSeparator = useObservableEagerState(store.price_decimal_sep$);
	const { format } = useCurrencyFormat({ withSymbol: false });
	const displayValue = showDecimals ? format(value) : value.replace(/\./g, decimalSeparator);
	const [opened, setOpened] = React.useState(false);
	const valueRef = React.useRef(displayValue);
	const t = useT();

	/**
	 *
	 */
	const handleSubmit = React.useCallback(() => {
		onChange(valueRef.current.replace(decimalSeparator, '.'));
		setOpened(false);
	}, [decimalSeparator, onChange]);

	/**
	 *
	 */
	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button variant="outline">
					<ButtonText>{displayValue}</ButtonText>
				</Button>
			</PopoverTrigger>
			<PopoverContent side={placement}>
				<Numpad
					initialValue={displayValue}
					onChange={(newValue: string) => {
						valueRef.current = newValue;
					}}
					onSubmitEditing={() => {
						handleSubmit();
					}}
					decimalSeparator={decimalSeparator}
					discounts={showDiscounts}
				/>
			</PopoverContent>
		</Popover>
	);

	/**
	 *
	 */
	// const children =
	// 	leftAccessory || rightAccessory || prefix ? (
	// 		<TextInputContainer
	// 			prefix={prefix}
	// 			leftAccessory={leftAccessory}
	// 			rightAccessory={rightAccessory}
	// 			onPress={() => setOpened(true)}
	// 			style={style}
	// 		>
	// 			{displayValue}
	// 		</TextInputContainer>
	// 	) : (
	// 		<Box border paddingY="xSmall" paddingX="small" rounding="large" style={style}>
	// 			<Text>{displayValue}</Text>
	// 		</Box>
	// 	);

	/**
	 *
	 */
	// return disabled ? (
	// 	<View style={{ flexDirection: 'row' }}>
	// 		<Box border paddingY="xSmall" paddingX="small" rounding="large">
	// 			<Text type="disabled">{displayValue}</Text>
	// 		</Box>
	// 	</View>
	// ) : (
	// 	<Popover>
	// 		<PopoverTrigger>{children}</PopoverTrigger>
	// 		<PopoverContent side={placement}>
	// 			<Numpad
	// 				initialValue={displayValue}
	// 				onChange={(newValue: string) => {
	// 					valueRef.current = newValue;
	// 				}}
	// 				onSubmitEditing={() => {
	// 					handleSubmit();
	// 				}}
	// 				decimalSeparator={decimalSeparator}
	// 				discounts={showDiscounts}
	// 			/>
	// 		</PopoverContent>
	// 	</Popover>
	// );
};

export default NumberInput;
