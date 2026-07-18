import * as React from 'react';

import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import { InputSources } from './input-sources';
import { TestPanel } from './test-panel';
import { BarcodeSettings } from './settings';
import { useT } from '../../../../contexts/translations';

export function BarcodeScanning() {
	const t = useT();

	return (
		<VStack className="gap-4">
			<BarcodeSettings />
			<InputSources />
			<Text className="text-md font-bold">{t('settings.barcode_scanning_test')}</Text>
			<TestPanel />
		</VStack>
	);
}
