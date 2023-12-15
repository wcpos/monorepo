import * as React from 'react';

// import { useObservableState } from 'observable-hooks';
import { isRxDocument } from 'rxdb';

// import { useAppState } from '../../../../contexts/app-state';
import { getCurrentGMTDate } from './utils';
import { useGuestCustomer } from '../../hooks/use-guest-customer';
import { useCurrentOrder } from '../contexts/current-order';

type CustomerDocument = import('@wcpos/database').CustomerDocument;
type Customer = CustomerDocument | { id: number; billing?: object; shipping: object };

export const useAddCustomer = () => {
	const { currentOrder } = useCurrentOrder();
	const guestCustomer = useGuestCustomer();
	// const { store } = useAppState();
	// const defaultCountry = useObservableState(store.default_country$, store.default_country);
	// const [country, state] = defaultCountry.split(':');

	/**
	 * Customer can be RxDocument or plain object
	 * -
	 */
	const addCustomer = React.useCallback(
		async (customer: Customer) => {
			// if RxDocument, get plain object
			let data = isRxDocument(customer) ? customer.toJSON() : customer;

			// if id === 0 and no billing or shipping, use guest customer
			data = data.id === 0 && !data.billing && !data.shipping ? guestCustomer : data;

			// if no billing country set, use store country, some gateways need this
			// if (!data.billing?.country) {
			// 	data.billing = {
			// 		...data.billing,
			// 		country,
			// 	};
			// }

			// now we have a customer object, we need to transform customer data to match order schema
			const tansformedData = {
				customer_id: data.id,
				billing: {
					...(data.billing || {}),
					email: data?.billing?.email || data?.email,
					first_name: data?.billing?.first_name || data.first_name || data?.username,
					last_name: data?.billing?.last_name || data.last_name,
				},
				shipping: data.shipping || {},
				date_modified_gmt: getCurrentGMTDate(),
			};

			/**
			 * Add customer to order
			 */
			const order = currentOrder.getLatest();
			return order.patch(tansformedData);
		},
		[currentOrder, guestCustomer]
	);

	return {
		addCustomer,
	};
};
