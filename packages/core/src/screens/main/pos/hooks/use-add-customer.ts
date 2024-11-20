import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';
import { isRxDocument } from 'rxdb';

import { transformCustomerJSONToOrderJSON } from './utils';
import { useAppState } from '../../../../contexts/app-state';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { useGuestCustomer } from '../../hooks/use-guest-customer';
import { useCurrentOrder } from '../contexts/current-order';

type CustomerDocument = import('@wcpos/database').CustomerDocument;
type Customer = CustomerDocument | { id: number; billing?: object; shipping?: object };

/**
 *
 */
export const useAddCustomer = () => {
	const { currentOrder } = useCurrentOrder();
	const guestCustomer = useGuestCustomer();
	const { localPatch } = useLocalMutation();
	const { store } = useAppState();
	const country = useObservableEagerState(store.store_country$);

	/**
	 * Customer can be RxDocument or plain object
	 */
	const addCustomer = React.useCallback(
		async (customer: Customer) => {
			// if RxDocument, get plain object
			let data = isRxDocument(customer) ? (customer as CustomerDocument).toMutableJSON() : customer;

			// if id === 0 and no billing or shipping, use guest customer
			data = data.id === 0 && !data.billing && !data.shipping ? guestCustomer : data;

			return localPatch({
				document: currentOrder,
				data: transformCustomerJSONToOrderJSON(data, country),
			});
		},
		[country, currentOrder, guestCustomer, localPatch]
	);

	return {
		addCustomer,
	};
};
