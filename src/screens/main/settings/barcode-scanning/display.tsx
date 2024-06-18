import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';
import { useHotkeys, RNKeyboardEvent, getKeyFromEvent } from '@wcpos/hooks/src/use-hotkeys';

import { useT } from '../../../../contexts/translations';
import { useBarcodeDetection } from '../../hooks/barcodes';

const BarcodeDisplay = () => {
	const [allKeys, setKeyPress] = React.useState('');
	const { barcode$ } = useBarcodeDetection();
	const barcode = useObservableState(barcode$);
	const theme = useTheme();
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
		<Box space="normal">
			<Box space="xSmall">
				<Text uppercase size="small" numberOfLines={1} type="textMuted">
					{t('Keypress Event', { _tags: 'core' })}
				</Text>
				<Box
					border
					rounding="small"
					padding="xSmall"
					style={{ backgroundColor: theme.colors.lightGrey, minHeight: 26 }}
				>
					<Text style={{ fontFamily: 'monospace' }}>{allKeys}</Text>
				</Box>
			</Box>
			<Box space="xSmall">
				<Text uppercase size="small" numberOfLines={1} type="textMuted">
					{t('Detected Barcode', { _tags: 'core' })}
				</Text>
				<Box
					border
					rounding="small"
					padding="xSmall"
					style={{ backgroundColor: theme.colors.lightGrey, minHeight: 26 }}
				>
					<Text style={{ fontFamily: 'monospace' }}>{barcode}</Text>
				</Box>
			</Box>
		</Box>
	);
};

export default BarcodeDisplay;
