import * as React from 'react';

import { isGuestCustomer } from '@wcpos/sync-core';

import { extractNameFromJSON } from './helpers';
import { useT } from '../../../../contexts/translations';

import type { CustomerData } from './helpers';

/**
 *
 */
export function useCustomerNameFormat() {
	const t = useT();

	/**
	 *
	 */
	const format = React.useCallback(
		(json: CustomerData) => {
			const name = extractNameFromJSON(json);

			if (name) {
				return name;
			}

			// fallback to Guest
			const customerID = json.id ?? json.customer_id;

			if (isGuestCustomer(customerID)) {
				return t('common.guest');
			}

			// fall back to ID
			if (customerID) {
				return t('common.id_2', { id: customerID });
			}

			// this should never happen
			return t('common.unknown_2');
		},
		[t]
	);

	return { format };
}
