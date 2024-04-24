import * as React from 'react';

import Box from '@wcpos/components/src/box';
import Suspense from '@wcpos/components/src/suspense';
import Tabs from '@wcpos/components/src/tabs';

import BarcodeScanning from './barcode-scanning';
import { GeneralSettings } from './general';
import { KeyboardShortcuts } from './shortcuts';
import { TaxSettings } from './tax';
import { useT } from '../../../contexts/translations';

/**
 *
 */
export const SettingsTabs = () => {
	const [index, setIndex] = React.useState(0);
	const t = useT();

	const routes = React.useMemo(
		() => [
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
		[t]
	);

	return (
		<Tabs
			navigationState={{
				index,
				routes,
			}}
			renderScene={({ route }) => (
				<Box paddingTop="small">
					<Suspense>
						<route.Component />
					</Suspense>
				</Box>
			)}
			onIndexChange={setIndex}
		/>
	);
};

export default SettingsTabs;
