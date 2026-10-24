import * as React from 'react';

import { useDocField } from '@wcpos/query';

import { useAppState } from '../../../contexts/app-state';

/**
 * A scanner burst while a keypad is open closes it, keeping the stored number. The wedge
 * detector (`use-barcode-detection`) never latches a burst's first key, so that digit reaches
 * the keypad, and it swallows the rest. Its mark on a latched key is `defaultPrevented`, set in
 * its own capture listener on the document. This one is registered on open, after the route's
 * detector, and same-node listeners run in registration order whatever `stopPropagation` says,
 * so it sees the mark. The detector latches on timing alone, so a quick typist's second key is
 * marked too; only a run of marked keys as long as the store's minimum barcode (less the
 * unmarked first key) is a scan, the length the detector itself accepts. Any unmarked key ends
 * the run. An effect: the document is outside React.
 */
export function useScannerBurstDismiss(
	open: boolean,
	keypad: React.RefObject<{ dismiss: () => void } | null>
) {
	const { store } = useAppState();
	const minChars = useDocField(store, (state) => state.barcode_scanning_min_chars) as
		number | undefined;
	const scanRun = Math.max(1, (Number(minChars) || 0) - 1);
	React.useEffect(() => {
		if (!open) return;
		let marked = 0;
		const onKey = (event: KeyboardEvent) => {
			marked = event.defaultPrevented ? marked + 1 : 0;
			if (marked >= scanRun) keypad.current?.dismiss();
		};
		document.addEventListener('keydown', onKey, true);
		return () => document.removeEventListener('keydown', onKey, true);
	}, [open, scanRun, keypad]);
}
