import React from 'react';

import { useLocalSearchParams } from 'expo-router';
import { ObservableResource } from 'observable-hooks';

import { Suspense } from '@wcpos/components/suspense';
import type { CustomerDocument } from '@wcpos/database';

import { EditCustomer } from './edit-customer';
import { useCollection } from '../../hooks/use-collection';

export const EditCustomerScreen = () => {
	const { customerId } = useLocalSearchParams<{ customerId: string }>();
	const { collection } = useCollection('customers');
	const query = collection.findOneFix(customerId);

	const resource = React.useMemo(
		() => new ObservableResource(query.$) as ObservableResource<CustomerDocument>,
		[query]
	);

	return (
		<Suspense>
			<EditCustomer resource={resource} />
		</Suspense>
	);
};
