import * as React from 'react';

import { IconButton } from '@wcpos/components/src/icon-button';

import { useWebSerialBarcodeScanner } from './use-serial-scanner';

export const ScannerButton = () => {
	const { connect, disconnect } = useWebSerialBarcodeScanner({ debug: true });

	return (
		<IconButton
			// className={device ? 'text-base' : 'text-muted'}
			name="barcode"
			onPress={connect}
		/>
	);
};
