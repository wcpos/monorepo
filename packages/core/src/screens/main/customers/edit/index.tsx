import { useLocalSearchParams } from 'expo-router';

import { Suspense } from '@wcpos/components/suspense';
import { useEngineRecord } from '@wcpos/query/record-readers';

import { EditCustomer } from './edit-customer';

export function EditCustomerScreen() {
	const { customerId } = useLocalSearchParams<{ customerId: string }>();
	const resource = useEngineRecord('customers', customerId);

	return (
		<Suspense>
			<EditCustomer resource={resource} />
		</Suspense>
	);
}
