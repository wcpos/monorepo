import * as React from 'react';

import { ErrorBoundary } from '@wcpos/components/src/error-boundary';
import {
	Modal,
	ModalContent,
	ModalHeader,
	ModalTitle,
	ModalBody,
} from '@wcpos/components/src/modal';
import { Suspense } from '@wcpos/components/src/suspense';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@wcpos/components/src/tabs';
import { Text } from '@wcpos/components/src/text';

import { BarcodeScanning } from './barcode-scanning';
import { GeneralSettings } from './general';
import { KeyboardShortcuts } from './shortcuts';
import { TaxSettings } from './tax';
import { useT } from '../../../contexts/translations';
import useModalRefreshFix from '../../../hooks/use-modal-refresh-fix';

/**
 *
 */
export const SettingsTabs = () => {
	const [value, setValue] = React.useState('general');
	const t = useT();
	useModalRefreshFix();

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
						<TabsList className="flex-row w-full">
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
