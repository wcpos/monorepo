import * as React from 'react';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Modal, ModalContent, ModalHeader, ModalTitle, ModalBody } from '@wcpos/components/modal';
import { Suspense } from '@wcpos/components/suspense';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@wcpos/components/tabs';
import { Text } from '@wcpos/components/text';

import { BarcodeScanning } from './barcode-scanning';
import { GeneralSettings } from './general';
import { KeyboardShortcuts } from './shortcuts';
import { TaxSettings } from './tax';
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
		<Modal>
			<ModalContent size="xl">
				<ModalHeader>
					<ModalTitle>{t('Settings', { _tags: 'core' })}</ModalTitle>
				</ModalHeader>
				<ModalBody>
					<Tabs value={value} onValueChange={setValue}>
						<TabsList className="w-full flex-row">
							{tabs.map((tab) => (
								<TabsTrigger key={tab.value} value={tab.value} className="flex-1">
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
