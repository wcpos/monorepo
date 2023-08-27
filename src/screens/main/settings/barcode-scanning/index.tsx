import * as React from 'react';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import BarcodeDisplay from './display';
import BarcodeSettings from './settings';
import { useT } from '../../../../contexts/translations';

const BarcodeScanning = () => {
	const t = useT();

	return (
		<Box space="normal">
			<BarcodeSettings />
			<Text size="medium" weight="medium">
				{t('Barcode Scanning Test', { _tags: 'core' })}
			</Text>
			<BarcodeDisplay />
		</Box>
	);
};

export default BarcodeScanning;
