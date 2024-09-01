import * as React from 'react';

import { Text } from '@wcpos/components/src/text';
import { VStack } from '@wcpos/components/src/vstack';

import { BarcodeDisplay } from './display';
import { BarcodeSettings } from './settings';
import { useT } from '../../../../contexts/translations';

export const BarcodeScanning = () => {
	const t = useT();

	return (
		<VStack>
			<BarcodeSettings />
			<Text className="text-md font-bold">{t('Barcode Scanning Test', { _tags: 'core' })}</Text>
			<BarcodeDisplay />
		</VStack>
	);
};
