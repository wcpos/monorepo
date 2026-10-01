import * as React from 'react';

import { ObserveInteractiveMarker } from 'expo-observe';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Suspense } from '@wcpos/components/suspense';

import { POSProductsPane } from '../../../../../components/pos-products-pane';

export default function POSProductsTab() {
	return (
		<ErrorBoundary>
			<Suspense>
				<POSProductsPane>
					{/* The phone's logged-in entry screen: time-to-interactive is the till's
					    mount, as on the columns layout (lib/observe.ts). */}
					<ObserveInteractiveMarker />
				</POSProductsPane>
			</Suspense>
		</ErrorBoundary>
	);
}
