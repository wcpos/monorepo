import * as React from 'react';
import { View } from 'react-native';

import { useObservableState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import Numpad from '@wcpos/components/src/numpad';
import Popover from '@wcpos/components/src/popover';
import Text from '@wcpos/components/src/text';

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
}

/**
 * Note: value comes in as decimalSeparator = '.' we need to convert it to the correct decimal separator
 */
const NumberInput = ({
	value = '0',
	onChange,
	disabled,
	showDecimals = false,
	showDiscounts,
}: NumberInputProps) => {
	const { store } = useAppState();
	const decimalSeparator = useObservableState(store.price_decimal_sep$, store.price_decimal_sep);
	const { format } = useCurrencyFormat({ withSymbol: false });
	const displayValue = showDecimals ? format(value) : value;
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
	return disabled ? (
		<View style={{ flexDirection: 'row' }}>
			<Box border paddingY="xSmall" paddingX="small" rounding="large">
				<Text type="disabled">{displayValue}</Text>
			</Box>
		</View>
	) : (
		<Popover
			withinPortal
			opened={opened}
			onOpen={() => setOpened(true)}
			onClose={() => setOpened(false)}
			primaryAction={{
				label: t('Done', { _tags: 'core' }),
				action: handleSubmit,
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
			</Popover.Content>
		</Popover>
	);
};

export default NumberInput;
