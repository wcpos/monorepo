import * as React from 'react';

import { Suspense } from '@wcpos/tailwind/src/suspense';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@wcpos/tailwind/src/tabs';
import { Text } from '@wcpos/tailwind/src/text';

import BarcodeScanning from './barcode-scanning';
import { GeneralSettings } from './general';
import { KeyboardShortcuts } from './shortcuts';
import { TaxSettings } from './tax';
import { useT } from '../../../contexts/translations';

/**
 *
 */
export const SettingsTabs = () => {
	const [value, setValue] = React.useState('general');
	const t = useT();

	const tabs = [
		{
			value: 'general',
			label: t('General Settings', { _tags: 'core' }),
			component: <GeneralSettings />,
		},
		{ value: 'tax', label: t('Tax Settings', { _tags: 'core' }), component: <TaxSettings /> },
		{
			value: 'barcode',
			label: t('Barcode Scanning', { _tags: 'core' }),
			component: <BarcodeScanning />,
		},
		{
			value: 'shortcuts',
			label: t('Keyboard Shortcuts', { _tags: 'core' }),
			component: <KeyboardShortcuts />,
		},
	];

	return (
		<Tabs value={value} onValueChange={setValue}>
			<TabsList className="flex-row w-full">
				{tabs.map((tab) => (
					<TabsTrigger key={tab.value} value={tab.value} className="flex-1">
						<Text>{tab.label}</Text>
					</TabsTrigger>
				))}
			</TabsList>
			{tabs.map((tab) => (
				<TabsContent key={tab.value} value={tab.value}>
					<Suspense>{tab.component}</Suspense>
				</TabsContent>
			))}
		</Tabs>
	);
};

export default SettingsTabs;
