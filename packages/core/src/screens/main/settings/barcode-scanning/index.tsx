import * as React from 'react';

import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import { BarcodeDisplay } from './display';
import { BarcodeSettings } from './settings';
import { useT } from '../../../../contexts/translations';

export function BarcodeScanning() {
	const t = useT();

	return (
		<VStack className="gap-4">
			<BarcodeSettings />
			<Text className="text-md font-bold">{t('settings.barcode_scanning_test')}</Text>
			<BarcodeDisplay />
		</VStack>
	);
}
