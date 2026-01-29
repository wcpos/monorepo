import * as React from 'react';

import { IconButton } from '@wcpos/components/icon-button';

import { useWebSerialBarcodeScanner } from './use-serial-scanner';

export const ScannerButton = () => {
	const { connect } = useWebSerialBarcodeScanner({ debug: true });

	return (
		<IconButton
			// className={device ? 'text-base' : 'text-muted'}
			name="barcode"
			onPress={connect}
		/>
	);
};
