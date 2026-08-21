import * as React from 'react';

import { isGuestCustomer } from '@wcpos/sync-core';
import { getLogger } from '@wcpos/utils/logger';
import { useDocField } from '@wcpos/query';

import { transformCustomerJSONToOrderJSON } from './utils';
import { useAppState } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { useGuestCustomer } from '../../hooks/use-guest-customer';
import { useCurrentOrder } from '../contexts/current-order';

import type { CustomerData } from '../../hooks/use-customer-name-format/helpers';

const cartLogger = getLogger(['wcpos', 'pos', 'cart']);

/**
 *
 */
export const useAddCustomer = () => {
	const { currentOrderRecord } = useCurrentOrder();
	const guestCustomer = useGuestCustomer();
	const { localPatch } = useLocalMutation();
	const { store } = useAppState();
	const country = useDocField(store, (value) => value.store_country);
	const t = useT();

	// Create order-specific logger
	const orderLogger = React.useMemo(
		() =>
			cartLogger.with({
				orderUUID: currentOrderRecord.uuid,
				orderID: currentOrderRecord.payload.id,
				orderNumber: currentOrderRecord.payload.number,
			}),
		[currentOrderRecord]
	);

	/**
	 * Customer selection already supplies payload-shaped data.
	 */
	const addCustomer = React.useCallback(
		async (customer: CustomerData) => {
			let data = customer;

			// a guest id with no billing or shipping means "use the guest customer defaults"
			const isGuest = isGuestCustomer(data.id) && !data.billing && !data.shipping;
			data = isGuest ? guestCustomer : data;

			// Get customer display name
			const customerName = isGuestCustomer(data.id)
				? t('common.guest')
				: `${data.first_name || ''} ${data.last_name || ''}`.trim() || data.email || `#${data.id}`;

			const result = await localPatch({
				document: currentOrderRecord,
				data: transformCustomerJSONToOrderJSON(
					data as unknown as import('@wcpos/database').CustomerDocument,
					country as string
				),
			});

			// Log customer assignment
			orderLogger.success(t('pos.customer_assigned', { customerName }), {
				context: {
					customerId: data.id,
					customerEmail: data.email,
					isGuest,
				},
			});

			return result;
		},
		[country, currentOrderRecord, guestCustomer, localPatch, orderLogger, t]
	);

	return {
		addCustomer,
	};
};
