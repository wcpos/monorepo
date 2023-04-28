import * as React from 'react';

import { t } from '../../../../lib/translations';

interface Props {
	id?: number;
	customer_id?: number;
	first_name?: string;
	last_name?: string;
	username?: string;
	email?: string;
	billing?: {
		first_name?: string;
		last_name?: string;
		username?: string;
		email?: string;
	};
	shipping?: {
		first_name?: string;
		last_name?: string;
	};
}

/**
 *
 */
export const useCustomerNameFormat = () => {
	const format = React.useCallback((json: Props) => {
		const customerID = json.id !== undefined ? json.id : null;

		// try full name first
		const firstName = json.first_name || json.billing?.first_name || json.shipping?.first_name;
		const lastName = json.last_name || json.billing?.last_name || json.shipping?.last_name;

		if (firstName && lastName) {
			return `${firstName} ${lastName}`;
		} else if (firstName || lastName) {
			return firstName || lastName;
		}

		// try username
		const username = json.username || json.billing?.username;

		if (username) {
			return username;
		}

		// try email
		const email = json.email || json.billing?.email;

		if (email) {
			return email;
		}

		// fallback to Guest
		if (customerID === 0) {
			return t('Guest', { _tags: 'core' });
		}

		// this should never happen
		return '';
	}, []);

	return { format };
};
