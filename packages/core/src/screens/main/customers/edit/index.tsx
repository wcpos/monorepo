import { useLocalSearchParams } from 'expo-router';

import { Suspense } from '@wcpos/components/suspense';
import type { CustomerDocument } from '@wcpos/database';

import { EditCustomer } from './edit-customer';
import { useEngineDocument } from '../../hooks/use-engine-document';

export function EditCustomerScreen() {
	const { customerId } = useLocalSearchParams<{ customerId: string }>();
	const resource = useEngineDocument<CustomerDocument>('customers', customerId);

	return (
		<Suspense>
			<EditCustomer resource={resource} />
		</Suspense>
	);
}
