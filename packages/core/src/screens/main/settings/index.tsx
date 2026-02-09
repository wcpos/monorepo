import * as React from 'react';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Modal, ModalBody, ModalContent, ModalHeader, ModalTitle } from '@wcpos/components/modal';
import { Suspense } from '@wcpos/components/suspense';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@wcpos/components/tabs';
import { Text } from '@wcpos/components/text';

import { BarcodeScanning } from './barcode-scanning';
import { GeneralSettings } from './general';
import { KeyboardShortcuts } from './shortcuts';
import { TaxSettings } from './tax';
import { ThemeSettings } from './theme';
import { useT } from '../../../contexts/translations';

/**
 *
 */
export const SettingsScreen = () => {
	const [value, setValue] = React.useState('general');
	const t = useT();

	const tabs = [
		{
			value: 'general',
			label: t('settings.general_settings'),
			component: <GeneralSettings />,
		},
		{ value: 'tax', label: t('settings.tax_settings'), component: <TaxSettings /> },
		{
			value: 'barcode',
			label: t('settings.barcode_scanning'),
			component: <BarcodeScanning />,
		},
		{
			value: 'shortcuts',
			label: t('settings.keyboard_shortcuts'),
			component: <KeyboardShortcuts />,
		},
		{
			value: 'theme',
			label: t('settings.theme'),
			component: <ThemeSettings />,
		},
	];

	return (
		<Modal>
			<ModalContent size="xl">
				<ModalHeader>
					<ModalTitle>{t('common.settings')}</ModalTitle>
				</ModalHeader>
				<ModalBody>
					<Tabs value={value} onValueChange={setValue}>
						<TabsList className="w-full flex-row">
							{tabs.map((tab) => (
								<TabsTrigger
									key={tab.value}
									value={tab.value}
									testID={`settings-tab-${tab.value}`}
									className="flex-1"
								>
									<Text>{tab.label}</Text>
								</TabsTrigger>
							))}
						</TabsList>
						{tabs.map((tab) => (
							<TabsContent key={tab.value} value={tab.value}>
								<ErrorBoundary>
									<Suspense>{tab.component}</Suspense>
								</ErrorBoundary>
							</TabsContent>
						))}
					</Tabs>
				</ModalBody>
			</ModalContent>
		</Modal>
	);
};
