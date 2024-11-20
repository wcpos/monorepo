import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import { useHotkeys, RNKeyboardEvent, getKeyFromEvent } from '@wcpos/hooks/src/use-hotkeys';
import { Input } from '@wcpos/components/src/input';
import { Label } from '@wcpos/components/src/label';
import { VStack } from '@wcpos/components/src/vstack';

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
				<Label nativeID="keypress-event">{t('Keypress Event', { _tags: 'core' })}</Label>
				<Input className="font-mono bg-accent" value={allKeys} editable={false} aria-disabled />
			</VStack>
			<VStack space="sm">
				<Label nativeID="detected-barcode">{t('Detected Barcode', { _tags: 'core' })}</Label>
				<Input className="font-mono bg-accent" value={barcode} editable={false} aria-disabled />
			</VStack>
		</VStack>
	);
};
