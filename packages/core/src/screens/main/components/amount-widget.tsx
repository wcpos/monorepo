import * as React from 'react';

import { useController, useFormContext } from 'react-hook-form';
import * as z from 'zod';

import { Button, ButtonText } from '@wcpos/components/src/button';
import { HStack } from '@wcpos/components/src/hstack';
import { Icon } from '@wcpos/components/src/icon';

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
export const AmountWidget = React.forwardRef<React.ElementRef<any>, any>(
	({ onChange, currencySymbol = '', ...props }, ref) => {
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
		const handleAmountChange = (newAmount: string) => {
			amountField.onChange(newAmount);
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
					ref={ref}
					value={amountField.value}
					placement="right"
					onChange={handleAmountChange}
					showDecimals
					buttonClassName="rounded-none"
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
);
