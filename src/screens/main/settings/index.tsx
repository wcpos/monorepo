import * as React from 'react';

import Box from '@wcpos/components/src/box';
import Tabs from '@wcpos/components/src/tabs';

import BarcodeScanning from './barcode-scanning';
import { GeneralSettings } from './general';
import { KeyboardShortcuts } from './shortcuts';
import { TaxSettings } from './tax';
import { t } from '../../../lib/translations';

/**
 *
 */
export const SettingsTabs = () => {
	const [index, setIndex] = React.useState(0);

	return (
		<Tabs
			navigationState={{
				index,
				routes: [
					{
						key: 'general',
						title: t('General Settings', { _tags: 'core' }),
						Component: GeneralSettings,
					},
					{ key: 'tax', title: t('Tax Settings', { _tags: 'core' }), Component: TaxSettings },
					{
						key: 'barcode',
						title: t('Barcode Scanning', { _tags: 'core' }),
						Component: BarcodeScanning,
					},
					{
						key: 'shortcuts',
						title: t('Keyboard Shortcuts', { _tags: 'core' }),
						Component: KeyboardShortcuts,
					},
				],
			}}
			renderScene={({ route }) => (
				<Box paddingTop="small">
					<route.Component />
				</Box>
			)}
			onIndexChange={setIndex}
		/>
	);
};

export default SettingsTabs;
