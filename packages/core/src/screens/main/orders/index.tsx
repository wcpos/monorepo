import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Suspense } from '@wcpos/components/suspense';

import { Orders } from './orders';

export const OrdersScreen = () => {
	return (
		<ErrorBoundary>
			<Suspense>
				<Orders />
			</Suspense>
		</ErrorBoundary>
	);
};
