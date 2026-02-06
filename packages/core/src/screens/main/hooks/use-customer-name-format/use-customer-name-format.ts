import * as React from 'react';

import { extractNameFromJSON, JSON } from './helpers';
import { useT } from '../../../../contexts/translations';

/**
 *
 */
export function useCustomerNameFormat() {
	const t = useT();

	/**
	 *
	 */
	const format = React.useCallback(
		(json: JSON) => {
			const name = extractNameFromJSON(json);

			if (name) {
				return name;
			}

			// fallback to Guest
			const customerID = json.id ?? json.customer_id;

			if (customerID === 0) {
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
