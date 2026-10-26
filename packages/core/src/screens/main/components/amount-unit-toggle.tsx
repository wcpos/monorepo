import * as React from 'react';

import { SegmentedControl } from '@wcpos/components/segmented-control';

import { useCurrencyFormat } from '../hooks/use-currency-format';

/**
 * The amount's unit, inside the amount row (property rows rule 4): the store's currency
 * symbol or %. `testID` is the % segment's, so pressing it selects percent.
 */
export function AmountUnitToggle({
	percent,
	onChange,
	testID,
}: {
	percent: boolean;
	onChange: (percent: boolean) => void;
	testID?: string;
}) {
	const { currencySymbol, currency } = useCurrencyFormat();
	const symbol = currencySymbol || currency;
	return (
		<SegmentedControl
			testID={testID && `${testID}-group`}
			segments={[
				{ value: 'amount', label: symbol },
				{ value: 'percent', label: '%', testID },
			]}
			value={percent ? 'percent' : 'amount'}
			onValueChange={(value) => onChange(value === 'percent')}
		/>
	);
}
