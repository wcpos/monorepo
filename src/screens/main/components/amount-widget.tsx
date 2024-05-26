import * as React from 'react';

import Button from '@wcpos/components/src/button';
import Icon from '@wcpos/components/src/icon';
import { TextInputWithLabel } from '@wcpos/components/src/textinput';
import useTheme from '@wcpos/themes';

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
		<TextInputWithLabel
			label={t('Amount', { _tags: 'core' })}
			value={amount}
			onChangeText={handleAmountChange}
			selectTextOnFocus
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
	);
};
