import * as React from 'react';
import { Platform, type ViewInstance, type ViewProps } from 'react-native';

export function useRowKeyboard(
	ids: string[],
	open: (uuid: string) => void,
	scroll: (index: number) => void
) {
	const [focusIndex, setFocusIndex] = React.useState(-1);
	// Whether the focused row shows its ring: only after a keyboard move. Uniwind has no
	// `focus-visible:`, and a click focuses the row too, so the hook keeps the distinction.
	const [ring, setRing] = React.useState(false);
	const viaKeyboard = React.useRef(false);
	const requestedFocus = React.useRef<number | null>(null);
	/** The row's own focus event (a click, a Tab, or the move this hook asked for). */
	const focusFrom = (index: number) => {
		setRing(viaKeyboard.current);
		viaKeyboard.current = false;
		setFocusIndex(index);
	};
	const focusRow = (index: number, node: ViewInstance | null) => {
		if (Platform.OS === 'web' && node && requestedFocus.current === index) {
			requestedFocus.current = null;
			node.focus();
		}
	};
	const onKeyDown: ViewProps['onKeyDown'] = (event) => {
		const control =
			event.target instanceof Element
				? event.target.closest('button,[role="button"],input,textarea,select,a')
				: null;
		if (control && !control.matches('[data-testid^="orders-row-"]')) return;
		if (event.nativeEvent.key === 'Enter' && ids[focusIndex]) {
			event.preventDefault();
			open(ids[focusIndex]);
			return;
		}
		if (
			!ids.length ||
			(event.nativeEvent.key !== 'ArrowDown' && event.nativeEvent.key !== 'ArrowUp')
		)
			return;
		event.preventDefault();
		const index = Math.max(
			0,
			Math.min(ids.length - 1, focusIndex + (event.nativeEvent.key === 'ArrowDown' ? 1 : -1))
		);
		requestedFocus.current = index;
		viaKeyboard.current = true;
		setRing(true);
		setFocusIndex(index);
		scroll(index);
	};
	return {
		focusRow,
		focusIndex,
		focusFrom,
		ring,
		onKeyDown: Platform.OS === 'web' ? onKeyDown : undefined,
	};
}
