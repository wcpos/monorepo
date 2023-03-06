import * as React from 'react';

import debounce from 'lodash/debounce';
import { useHotkeys } from 'react-hotkeys-hook';

import { isAlphaNumeric } from './validate';

const DEBOUNCE = 5;
const CHARCOUNT = 8;

export const useDetectBarcode = (callback: (barcode: string) => void) => {
	const barcode = React.useRef('');

	const handleBarcode = debounce(() => {
		if (barcode.current.length >= CHARCOUNT) {
			callback && callback(barcode.current);
		} else {
			barcode.current = '';
		}
	}, DEBOUNCE);

	/**
	 *
	 */
	useHotkeys('*', (event, handler) => {
		if (isAlphaNumeric(event.key)) {
			barcode.current = barcode.current + event.key;
			handleBarcode();
		}
	});
};
