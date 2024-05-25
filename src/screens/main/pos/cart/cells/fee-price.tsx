import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import Text from '@wcpos/components/src/text';

import { useAppState } from '../../../../../contexts/app-state';
import { useT } from '../../../../../contexts/translations';
import NumberInput from '../../../components/number-input';
import { useTaxCalculator } from '../../../hooks/taxes/use-tax-calculator';
import { useUpdateFeeLine } from '../../hooks/use-update-fee-line';
import { getMetaDataValueByKey } from '../../hooks/utils';

type LineItem = import('@wcpos/database').OrderDocument['fee_lines'][number];
interface Props {
	uuid: string;
	item: LineItem;
	column: import('@wcpos/components/src/table').ColumnProps<LineItem>;
}

/**
 *
 */
export const FeePrice = ({ uuid, item, column }: Props) => {
	const { updateFeeLine } = useUpdateFeeLine();
	const { store } = useAppState();
	const taxDisplayCart = useObservableEagerState(store.tax_display_cart$);
	const { calculateTaxesFromValue } = useTaxCalculator();
	const t = useT();

	/**
	 *
	 */
	const { displayPrice, percent } = React.useMemo(() => {
		const posData = getMetaDataValueByKey(item.meta_data, '_woocommerce_pos_data');
		const { amount, percent, prices_include_tax } = JSON.parse(posData);
		let displayPrice = amount;

		// mismatched tax settings
		if (taxDisplayCart === 'excl' && prices_include_tax && !percent) {
			const taxes = calculateTaxesFromValue({
				value: amount,
				taxStatus: item.tax_status,
				taxClass: item.tax_class,
				valueIncludesTax: true,
			});

			displayPrice = String(parseFloat(amount) - taxes.total);
		}

		// mismatched tax settings
		if (taxDisplayCart === 'incl' && !prices_include_tax && !percent) {
			const taxes = calculateTaxesFromValue({
				value: amount,
				taxStatus: item.tax_status,
				taxClass: item.tax_class,
				valueIncludesTax: true,
			});

			displayPrice = String(parseFloat(amount) + taxes.total);
		}

		return { displayPrice, percent };
	}, [calculateTaxesFromValue, item.meta_data, item.tax_class, item.tax_status, taxDisplayCart]);

	/**
	 *
	 */
	return (
		<>
			<NumberInput
				value={displayPrice}
				onChange={(amount) => updateFeeLine(uuid, { amount })}
				showDecimals={!percent}
				// showDiscounts={ensureNumberArray(quickDiscounts)}
			/>
			{percent && (
				<Text type="textMuted" size="small">
					{t('{percent}% of {total}', { percent: displayPrice, total: '0', _tags: 'core' })}
				</Text>
			)}
		</>
	);
};
