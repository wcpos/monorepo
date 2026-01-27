import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';
import { isRxDocument } from 'rxdb';

import { getLogger } from '@wcpos/utils/logger';

import { transformCustomerJSONToOrderJSON } from './utils';
import { useAppState } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { useGuestCustomer } from '../../hooks/use-guest-customer';
import { useCurrentOrder } from '../contexts/current-order';

type CustomerDocument = import('@wcpos/database').CustomerDocument;
type Customer = CustomerDocument | { id: number; billing?: object; shipping?: object };

const cartLogger = getLogger(['wcpos', 'pos', 'cart']);

/**
 *
 */
export const useAddCustomer = () => {
	const { currentOrder } = useCurrentOrder();
	const guestCustomer = useGuestCustomer();
	const { localPatch } = useLocalMutation();
	const { store } = useAppState();
	const country = useObservableEagerState(store.store_country$);
	const t = useT();

	// Create order-specific logger
	const orderLogger = React.useMemo(
		() =>
			cartLogger.with({
				orderUUID: currentOrder.uuid,
				orderID: currentOrder.id,
				orderNumber: currentOrder.number,
			}),
		[currentOrder.uuid, currentOrder.id, currentOrder.number]
	);

	/**
	 * Customer can be RxDocument or plain object
	 */
	const addCustomer = React.useCallback(
		async (customer: Customer) => {
			// if RxDocument, get plain object
			let data = isRxDocument(customer) ? (customer as CustomerDocument).toMutableJSON() : customer;

			// if id === 0 and no billing or shipping, use guest customer
			const isGuest = data.id === 0 && !data.billing && !data.shipping;
			data = isGuest ? guestCustomer : data;

			// Get customer display name
			const customerName =
				data.id === 0
					? t('Guest', { _tags: 'core' })
					: `${data.first_name || ''} ${data.last_name || ''}`.trim() ||
						data.email ||
						`#${data.id}`;

			const result = await localPatch({
				document: currentOrder,
				data: transformCustomerJSONToOrderJSON(data, country),
			});

			// Log customer assignment
			orderLogger.success(t('Customer assigned: {customerName}', { _tags: 'core', customerName }), {
				saveToDb: true,
				context: {
					customerId: data.id,
					customerEmail: data.email,
					isGuest,
				},
			});

			return result;
		},
		[country, currentOrder, guestCustomer, localPatch, orderLogger, t]
	);

	return {
		addCustomer,
	};
};
