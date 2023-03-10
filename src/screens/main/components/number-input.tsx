import * as React from 'react';
import { View } from 'react-native';

import Box from '@wcpos/components/src/box';
import Numpad from '@wcpos/components/src/numpad';
import Popover from '@wcpos/components/src/popover';
import Text from '@wcpos/components/src/text';
import { TextInputContainer } from '@wcpos/components/src/textinput';

import useCurrencyFormat from '../hooks/use-currency-format';

interface NumberInputProps {
	/**  */
	value: string;

	/**  */
	onChange: (value: string) => void;

	/**  */
	disabled?: boolean;

	/**  */
	showDecimals?: boolean;
}

/**
 *
 */
const NumberInput = ({
	value = '0',
	onChange,
	disabled,
	showDecimals = false,
}: NumberInputProps) => {
	const valueRef = React.useRef(value);
	const { format } = useCurrencyFormat({ withSymbol: false });
	const displayValue = showDecimals ? format(value) : value;

	/**
	 *
	 */
	return disabled ? (
		<View style={{ flexDirection: 'row' }}>
			<Box border paddingY="xSmall" paddingX="small" rounding="large">
				<Text type="disabled">{displayValue}</Text>
			</Box>
		</View>
	) : (
		<Popover
			withinPortal
			primaryAction={{
				label: 'Done',
				action: () => onChange(valueRef.current),
			}}
		>
			<Popover.Target>
				<Box border paddingY="xSmall" paddingX="small" rounding="large">
					<Text>{displayValue}</Text>
				</Box>
				{/* <TextInputContainer>{value}</TextInputContainer> */}
			</Popover.Target>
			<Popover.Content>
				<Numpad
					initialValue={String(value)}
					onChange={(newValue: string) => {
						valueRef.current = newValue;
					}}
				/>
			</Popover.Content>
		</Popover>
	);
};

export default NumberInput;
