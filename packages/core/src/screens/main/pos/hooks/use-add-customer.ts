import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';
import { isRxDocument } from 'rxdb';

import { isGuestCustomer } from '@wcpos/sync-core';
import { getLogger } from '@wcpos/utils/logger';

import { transformCustomerJSONToOrderJSON } from './utils';
import { useAppState } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { useGuestCustomer } from '../../hooks/use-guest-customer';
import { useCurrentOrder } from '../contexts/current-order';

import type { CustomerData } from '../../hooks/use-customer-name-format/helpers';

type CustomerDocument = import('@wcpos/database').CustomerDocument;
type Customer = CustomerDocument | CustomerData;

const cartLogger = getLogger(['wcpos', 'pos', 'cart']);

/**
 *
 */
export const useAddCustomer = () => {
	const { currentOrderRecord } = useCurrentOrder();
	const guestCustomer = useGuestCustomer();
	const { localPatch } = useLocalMutation();
	const { store } = useAppState();
	const country = useObservableEagerState(store.store_country$);
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
	 * Customer can be RxDocument or plain object
	 */
	const addCustomer = React.useCallback(
		async (customer: Customer) => {
			// if RxDocument, get plain object
			let data: CustomerData = isRxDocument(customer)
				? (customer as CustomerDocument).toMutableJSON()
				: customer;

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
					data as unknown as CustomerDocument,
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
