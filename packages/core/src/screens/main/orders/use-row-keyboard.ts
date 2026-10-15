import * as React from 'react';
import { Platform, type ViewInstance, type ViewProps } from 'react-native';

export function useRowKeyboard(
	ids: string[],
	select: (uuid: string | null) => void,
	scroll: (index: number) => void
) {
	const [focusIndex, setFocusIndex] = React.useState(-1);
	const requestedFocus = React.useRef<number | null>(null);
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
		if (event.nativeEvent.key === 'Escape') {
			event.preventDefault();
			select(null);
			return;
		}
		if (event.nativeEvent.key === 'Enter' && ids[focusIndex]) {
			event.preventDefault();
			select(ids[focusIndex]);
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
		setFocusIndex(index);
		scroll(index);
	};
	return {
		focusRow,
		focusIndex,
		setFocusIndex,
		onKeyDown: Platform.OS === 'web' ? onKeyDown : undefined,
	};
}
