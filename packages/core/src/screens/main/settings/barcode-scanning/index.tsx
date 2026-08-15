import * as React from 'react';

import { VStack } from '@wcpos/components/vstack';

import { InputSources } from './input-sources';
import { TestPanel } from './test-panel';
import { BarcodeSettings } from './settings';
import { SettingsSection } from '../components/settings-section';
import { useT } from '../../../../contexts/translations';

export function BarcodeScanning() {
	const t = useT();

	return (
		<VStack className="gap-5">
			<BarcodeSettings />
			<InputSources />
			<SettingsSection title={t('settings.barcode_scanning_test')}>
				<TestPanel />
			</SettingsSection>
		</VStack>
	);
}
