import * as React from 'react';
import { View } from 'react-native';

import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';

import { CurrencyInput } from '../../components/currency-input';
import { NumberInput } from '../../components/number-input';
import { useCurrencyFormat } from '../../hooks/use-currency-format';

interface DiscountAmountInputProps {
	discountType: 'percent' | 'fixed_cart' | 'fixed_product';
	value?: string | number;
	onChange?: (value: number) => void;
	testID?: string;
}

/**
 * The affix sits *next to* the input, not inside it, because on web the number
 * input renders as a numpad button (not a text field). Affix side and symbol are
 * locale-correct via the hook's `prefix`/`suffix` (a right-positioned currency
 * renders on the right).
 */
export function DiscountAmountInput({
	discountType,
	value,
	onChange,
	testID = 'coupon-amount',
}: DiscountAmountInputProps) {
	const { prefix, suffix } = useCurrencyFormat();
	const isPercent = discountType === 'percent';
	const before = isPercent ? '' : prefix.trim();
	const after = isPercent ? '%' : suffix.trim();

	return (
		<HStack className="items-center gap-2">
			{!!before && <Text className="text-muted-foreground text-lg font-semibold">{before}</Text>}
			<View className="flex-1">
				{isPercent ? (
					<NumberInput value={value} onChangeText={onChange} testID={testID} />
				) : (
					<CurrencyInput value={value} onChangeText={onChange} testID={testID} />
				)}
			</View>
			{!!after && <Text className="text-muted-foreground text-lg font-semibold">{after}</Text>}
		</HStack>
	);
}
