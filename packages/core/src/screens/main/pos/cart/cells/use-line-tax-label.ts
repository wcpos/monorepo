import * as React from 'react';

import { useDocField } from '@wcpos/query';

import { useAppState } from '../../../../../contexts/app-state';
import { useT } from '../../../../../contexts/translations';
import { useCurrentOrderCurrencyFormat } from '../../../hooks/use-current-order-currency-format';

/**
 * The tax line under a cart line's amount: "incl. $4.01 tax" or "excl. $4.01 tax", translated
 * (climb T1; it printed the raw store enum before).
 */
export function useLineTaxLabel(): (tax: number) => string {
	const t = useT();
	const { format } = useCurrentOrderCurrencyFormat();
	const { store } = useAppState();
	const taxDisplayCart = useDocField(store, (value) => value.tax_display_cart);

	return React.useCallback(
		(tax: number) =>
			taxDisplayCart === 'incl'
				? t('common.incl_tax_amount', { amount: format(tax) })
				: t('common.excl_tax_amount', { amount: format(tax) }),
		[t, format, taxDisplayCart]
	);
}
