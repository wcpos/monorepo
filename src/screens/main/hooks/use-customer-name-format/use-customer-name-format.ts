import * as React from 'react';

import { extractNameFromJSON, JSON } from './helpers';
import { t } from '../../../../lib/translations';

/**
 *
 */
export const useCustomerNameFormat = () => {
	/**
	 *
	 */
	const format = React.useCallback((json: JSON) => {
		const name = extractNameFromJSON(json);

		if (name) {
			return name;
		}

		// fallback to Guest
		const customerID = json.id ?? json.customer_id;

		if (customerID === 0) {
			return t('Guest', { _tags: 'core' });
		}

		// this should never happen
		return '';
	}, []);

	return { format };
};
