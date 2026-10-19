import * as React from 'react';

import { getBarcodeLibrary, loadBarcodeLibrary } from '@wcpos/receipt-renderer/barcode-library';

export function useBarcodeLibrary(): boolean {
	const [ready, setReady] = React.useState(() => getBarcodeLibrary() !== null);

	// Load on mount so synchronous receipt previews rerender when SVG rendering is ready.
	React.useEffect(() => {
		if (!ready) {
			void loadBarcodeLibrary().then(
				() => setReady(true),
				() => undefined
			);
		}
	}, [ready]);

	return ready || getBarcodeLibrary() !== null;
}
