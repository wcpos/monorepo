import React from 'react';

import { MoneyList } from '@wcpos/components/money-list';
import { Text } from '@wcpos/components/text';
import { useDocField } from '@wcpos/query';

import { useAppState } from '../../../../../contexts/app-state';
import { useT } from '../../../../../contexts/translations';
import { useCurrentOrderCurrencyFormat } from '../../../hooks/use-current-order-currency-format';
import { useTaxInclOrExcl } from '../../../hooks/use-tax-incl-or-excl';

interface Props {
	totalTax: string;
	taxLines: import('@wcpos/query').OrderTaxLines;
}

/**
 *
 */
export function Taxes({ totalTax, taxLines = [] }: Props) {
	const { store } = useAppState();
	const taxTotalDisplay = useDocField(store, (value) => value.tax_total_display);
	const { format } = useCurrentOrderCurrencyFormat();
	const { inclOrExcl } = useTaxInclOrExcl({ context: 'cart' });
	const t = useT();

	// The rate's own label (Woo's itemized display), its incl/excl beside it at the help size.
	const beside = <Text variant="help">{String(inclOrExcl)}</Text>;
	if (taxTotalDisplay === 'itemized') {
		return taxLines.map((tax, index) => (
			<MoneyList.Row
				key={index}
				label={tax.label ?? t('common.taxes')}
				beside={beside}
				// tax_total and shipping_tax_total are separate, but we will display together
				amount={format(
					parseFloat(tax.tax_total ?? '0') + parseFloat(tax.shipping_tax_total ?? '0') || 0
				)}
			/>
		));
	}

	return (
		<MoneyList.Row
			label={t('common.total_tax')}
			beside={beside}
			amount={format(parseFloat(totalTax) || 0)}
		/>
	);
}
