import * as React from 'react';

import Box from '@wcpos/components/src/box';
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
			value={value}
			onValueChange={setValue}
			className="w-full max-w-[400px] mx-auto flex-col gap-1.5"
		>
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
