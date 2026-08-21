import { useLocalSearchParams } from 'expo-router';

import { Suspense } from '@wcpos/components/suspense';

import { EditCustomer } from './edit-customer';
import { useEngineRecord } from '../../hooks/use-engine-document';

export function EditCustomerScreen() {
	const { customerId } = useLocalSearchParams<{ customerId: string }>();
	const resource = useEngineRecord('customers', customerId);

	return (
		<Suspense>
			<EditCustomer resource={resource} />
		</Suspense>
	);
}
