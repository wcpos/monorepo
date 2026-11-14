import * as React from 'react';

import { HStack } from '@wcpos/components/hstack';
import { IconButton } from '@wcpos/components/icon-button';
import { Text } from '@wcpos/components/text';

import { useT } from '../../../../../contexts/translations';

interface Props {
	picked: number;
	unpaid: number;
	onChange: (units: number) => void;
	/** `checkout-line-<key>`: the buttons and the count add `-minus`, `-units`, `-plus`. */
	testIDBase: string;
}

/** `− n of unpaid +`: THIS payment's units of a line, on the tablet bill and the phone pick list. */
export function UnitStepper({ picked, unpaid, onChange, testIDBase }: Props) {
	const t = useT();
	return (
		<HStack className="items-center gap-2">
			<IconButton
				name="minus"
				variant="outline"
				accessibilityLabel={t('pos_cart.quantity_decrease')}
				testID={`${testIDBase}-minus`}
				disabled={picked <= 0}
				onPress={() => onChange(picked - 1)}
			/>
			<Text testID={`${testIDBase}-units`} className="text-center tabular-nums" numberOfLines={1}>
				{t('pos_checkout.n_of_units', { n: picked, total: unpaid })}
			</Text>
			<IconButton
				name="plus"
				variant="outline"
				accessibilityLabel={t('pos_cart.quantity_increase')}
				testID={`${testIDBase}-plus`}
				disabled={picked >= unpaid}
				// A fractional last unit (1.5 unpaid) steps to the remainder, never past it.
				onPress={() => onChange(Math.min(picked + 1, unpaid))}
			/>
		</HStack>
	);
}
