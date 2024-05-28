import * as React from 'react';

import Button from '@wcpos/components/src/button';
import { InputWithLabel } from '@wcpos/components/src/form-layout';
import Icon from '@wcpos/components/src/icon';
import useTheme from '@wcpos/themes';

import NumberInput from './number-input';
import { useT } from '../../../contexts/translations';

interface Props {
	currencySymbol: string;
	onChange: ({ amount, percent }: { amount?: string; percent?: boolean }) => void;
	amount?: string;
	percent?: boolean;
}

/**
 * Extracted widget for amount/percent input
 */
export const AmountWidget = ({ currencySymbol, onChange, ...props }: Props) => {
	const theme = useTheme();
	const t = useT();
	const [amount, setAmount] = React.useState(props.amount);
	const [percent, setPercent] = React.useState(props.percent);

	const handleAmountChange = (value: string) => {
		setAmount(value);
		onChange({ amount: value });
	};

	const handlePercentChange = (value: boolean) => {
		setPercent(value);
		onChange({ percent: value });
	};

	return (
		<InputWithLabel label={t('Amount', { _tags: 'core' })} style={{ width: 200 }}>
			<NumberInput
				value={amount}
				placement="right"
				onChange={handleAmountChange}
				showDecimals
				leftAccessory={
					<Button
						title={currencySymbol}
						type={!percent ? 'primary' : 'disabled'}
						onPress={() => handlePercentChange(false)}
						style={{
							borderTopLeftRadius: theme.rounding.small,
							borderBottomLeftRadius: theme.rounding.small,
							borderTopRightRadius: 0,
							borderBottomRightRadius: 0,
						}}
					/>
				}
				rightAccessory={
					<Button
						title={<Icon name="percent" type="inverse" />}
						type={percent ? 'primary' : 'disabled'}
						onPress={() => handlePercentChange(true)}
						style={{
							borderTopLeftRadius: 0,
							borderBottomLeftRadius: 0,
							borderTopRightRadius: theme.rounding.small,
							borderBottomRightRadius: theme.rounding.small,
						}}
					/>
				}
			/>
		</InputWithLabel>
	);

	// return (
	// 	<TextInputWithLabel
	// 		label={t('Amount', { _tags: 'core' })}
	// 		value={amount}
	// 		onChangeText={handleAmountChange}
	// 		selectTextOnFocus
	// 	/>
	// );
};
