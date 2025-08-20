import * as React from 'react';

import { ModalClose, ModalFooter } from '@wcpos/components/modal';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import { BarcodeDisplay } from './display';
import { BarcodeSettings } from './settings';
import { useT } from '../../../../contexts/translations';

export const BarcodeScanning = () => {
	const t = useT();

	return (
		<VStack className="gap-4">
			<BarcodeSettings />
			<Text className="text-md font-bold">{t('Barcode Scanning Test', { _tags: 'core' })}</Text>
			<BarcodeDisplay />
			<ModalFooter className="px-0">
				<ModalClose>{t('Close', { _tags: 'core' })}</ModalClose>
			</ModalFooter>
		</VStack>
	);
};
