import * as React from 'react';

import { useDocField } from '@wcpos/query';

import { useStoreSession } from '../../../../contexts/app-state';

/**
 * An order's currency is never empty, so it is no presence fact: it is a row while it differs
 * from the store's, or once its add button asked for it, and stays one for the dialog's life
 * (changing it back never pulls the row from under the cashier). It has no Remove.
 */
export function useCurrencyRow(currency: string | undefined) {
	const { store } = useStoreSession();
	const storeCurrency = useDocField(store, (value) => value.currency);
	const differs = !!currency && !!storeCurrency && currency !== storeCurrency;
	const [shown, setShown] = React.useState(differs);
	// A differing currency that arrives later keeps its row: adjusted during render, not an effect.
	if (differs && !shown) setShown(true);
	return { shown, show: () => setShown(true) };
}
