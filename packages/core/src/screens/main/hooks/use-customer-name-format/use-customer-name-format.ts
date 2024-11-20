import * as React from 'react';

import { extractNameFromJSON, JSON } from './helpers';
import { useT } from '../../../../contexts/translations';

/**
 *
 */
export const useCustomerNameFormat = () => {
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
				return t('Guest', { _tags: 'core' });
			}

			// fall back to ID
			if (customerID) {
				return t('ID: {id}', { id: customerID, _tags: 'core' });
			}

			// this should never happen
			return t('unknown', { _tags: 'core' });
		},
		[t]
	);

	return { format };
};
