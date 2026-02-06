import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import { getKeyFromEvent, RNKeyboardEvent, useHotkeys } from '@wcpos/hooks/use-hotkeys';
import { Input } from '@wcpos/components/input';
import { Label } from '@wcpos/components/label';
import { VStack } from '@wcpos/components/vstack';

import { useT } from '../../../../contexts/translations';
import { useBarcodeDetection } from '../../hooks/barcodes';

/**
 *
 */
export const BarcodeDisplay = () => {
	const [allKeys, setKeyPress] = React.useState('');
	const { barcode$ } = useBarcodeDetection();
	const barcode = useObservableState(barcode$);
	const t = useT();

	/**
	 *
	 */
	const onKeyboardEvent = React.useCallback((event: RNKeyboardEvent) => {
		setKeyPress((prev) => (prev += getKeyFromEvent(event)));
	}, []);

	/**
	 *
	 */
	useHotkeys('*', onKeyboardEvent);

	return (
		<VStack>
			<VStack space="sm">
				<Label nativeID="keypress-event">{t('settings.keypress_event')}</Label>
				<Input className="bg-accent font-mono" value={allKeys} editable={false} aria-disabled />
			</VStack>
			<VStack space="sm">
				<Label nativeID="detected-barcode">{t('settings.detected_barcode')}</Label>
				<Input className="bg-accent font-mono" value={barcode} editable={false} aria-disabled />
			</VStack>
		</VStack>
	);
};
