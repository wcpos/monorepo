import * as React from 'react';

import { of } from 'rxjs';

import { useDefaultCustomerID } from './use-default-customer-id';
import { useGetDocumentByRemoteId$ } from '../hooks/use-get-document-by-id';
import useGuestCustomer from '../hooks/use-guest-customer';

export const useDefaultCustomer = () => {
	const guestCustomer = useGuestCustomer();
	const defaultCustomerID = useDefaultCustomerID();
	const defaultCustomer$ = useGetDocumentByRemoteId$('customers', defaultCustomerID);

	return defaultCustomerID === 0 ? of(guestCustomer) : defaultCustomer$;
};
