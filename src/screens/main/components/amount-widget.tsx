import * as React from 'react';

import Button from '@wcpos/components/src/button';
import Icon from '@wcpos/components/src/icon';
import { TextInputWithLabel } from '@wcpos/components/src/textinput';
import useTheme from '@wcpos/themes';

import { useT } from '../../../contexts/translations';

/**
 * Extracted widget for amount/percent input
 */
export const AmountWidget = ({
	currencySymbol,
	amountDataRef,
}: {
	currencySymbol: string;
	amountDataRef: React.MutableRefObject<{ amount: string; percent: boolean }>;
}) => {
	const theme = useTheme();
	const [amount, setAmount] = React.useState(amountDataRef.current.amount);
	const [percent, setPercent] = React.useState(amountDataRef.current.percent);
	const t = useT();

	const handleAmountChange = (value) => {
		setAmount(value);
		amountDataRef.current.amount = value;
	};

	const handlePercentChange = (value) => {
		setPercent(value);
		amountDataRef.current.percent = value;
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
