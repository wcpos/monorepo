import * as React from 'react';

import { lazyRest } from '@wcpos/core/screens/main/rest/lazy-screen';

const Screen = lazyRest((m) => m.BarcodeScanningSettingsPage);

export default function BarcodeScanningSettingsPage() {
	return (
		<React.Suspense fallback={null}>
			<Screen />
		</React.Suspense>
	);
}
