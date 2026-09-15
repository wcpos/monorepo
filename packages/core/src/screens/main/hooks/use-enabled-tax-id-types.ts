import * as React from 'react';

import { useDocField } from '@wcpos/query';

import { useStoreSession } from '../../../contexts/app-state';
import { TAX_ID_TYPES, type TaxIdType } from '../../../lib/tax-id';

/**
 * The tax-ID types offered in the till's "Type" dropdown.
 *
 * WP Admin carries an allow-list (`customer_tax_id_types`) so a store that only
 * ever issues one kind of tax ID doesn't scroll past thirteen others to reach
 * it. An empty allow-list is the "no restriction" sentinel — plugin versions
 * predating the setting omit the field entirely and must keep seeing the whole
 * catalogue.
 *
 * Types the server allows but this build doesn't know about are dropped, so the
 * result is always a subset of {@link TAX_ID_TYPES} in canonical order.
 */
export const useEnabledTaxIdTypes = (): readonly TaxIdType[] => {
	const { store } = useStoreSession();
	const allowed = useDocField(store, (value) => value.customer_tax_id_types);

	return React.useMemo(() => {
		if (!Array.isArray(allowed) || allowed.length === 0) {
			return TAX_ID_TYPES;
		}
		const allowSet = new Set(allowed);
		const filtered = TAX_ID_TYPES.filter((type) => allowSet.has(type));

		// An allow-list this build recognises nothing in would leave the select
		// empty and the row unfillable — fall back to the full catalogue.
		return filtered.length > 0 ? filtered : TAX_ID_TYPES;
	}, [allowed]);
};
