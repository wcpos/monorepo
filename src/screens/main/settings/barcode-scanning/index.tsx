import * as React from 'react';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import BarcodeDisplay from './display';
import BarcodeSettings from './settings';
import { t } from '../../../../lib/translations';

const BarcodeScanning = () => {
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
