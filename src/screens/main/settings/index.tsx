import * as React from 'react';

import Suspense from '@wcpos/components/src/suspense';
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

	return (
		<Tabs value={value} onValueChange={setValue}>
			<TabsList className="flex-row w-full">
				<TabsTrigger value="general" className="flex-1">
					<Text>{t('General Settings', { _tags: 'core' })}</Text>
				</TabsTrigger>
				<TabsTrigger value="tax" className="flex-1">
					<Text>{t('Tax Settings', { _tags: 'core' })}</Text>
				</TabsTrigger>
				<TabsTrigger value="barcode" className="flex-1">
					<Text>{t('Barcode Scanning', { _tags: 'core' })}</Text>
				</TabsTrigger>
				<TabsTrigger value="shortcuts" className="flex-1">
					<Text>{t('Keyboard Shortcuts', { _tags: 'core' })}</Text>
				</TabsTrigger>
			</TabsList>
			<TabsContent value="general">
				<Suspense>
					<GeneralSettings />
				</Suspense>
			</TabsContent>
			<TabsContent value="tax">
				<Suspense>
					<TaxSettings />
				</Suspense>
			</TabsContent>
			<TabsContent value="barcode">
				<Suspense>
					<BarcodeScanning />
				</Suspense>
			</TabsContent>
			<TabsContent value="shortcuts">
				<Suspense>
					<KeyboardShortcuts />
				</Suspense>
			</TabsContent>
		</Tabs>
	);
};

export default SettingsTabs;
