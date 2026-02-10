import * as React from 'react';

import { useController, useFormContext } from 'react-hook-form';
import * as z from 'zod';

import { Button, ButtonText } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';

import { NumberInput } from './number-input';

/**
 *
 */
export const amountWidgetSchema = z.object({
	amount: z.string().optional(),
	percent: z.boolean().optional(),
});

interface Props {
	currencySymbol: string;
	nameAmount: string;
	namePercent: string;
}

/**
 * Extracted widget for amount/percent input
 */
export function AmountWidget({ currencySymbol = '' }: Props) {
	const { control } = useFormContext();

	/**
	 *
	 */
	const { field: amountField } = useController({
		name: 'amount',
		control,
	});

	const { field: percentField } = useController({
		name: 'percent',
		control,
	});

	/**
	 *
	 */
	const handleAmountChange = (newAmount: number) => {
		amountField.onChange(String(newAmount));
	};

	const handlePercentChange = (isPercent: boolean) => {
		percentField.onChange(isPercent);
	};

	/**
	 *
	 */
	return (
		<HStack className="gap-0">
			<Button
				disabled={percentField.value}
				onPress={() => handlePercentChange(false)}
				className="rounded-r-none"
			>
				<ButtonText>{currencySymbol}</ButtonText>
			</Button>
			<NumberInput
				value={amountField.value}
				placement="right"
				onChangeText={handleAmountChange}
				className="rounded-none"
			/>
			<Button
				disabled={!percentField.value}
				onPress={() => handlePercentChange(true)}
				className="rounded-l-none"
			>
				<Icon name="percent" className="fill-primary-foreground" />
			</Button>
		</HStack>
	);
}
