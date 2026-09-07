import * as React from 'react';
import { BackHandler, Platform } from 'react-native';

export function useCheckoutBack(back: () => void, { escape = true } = {}) {
	// Native hardware and DOM keyboard events are external sources; subscribe only
	// while this checkout pane is mounted, and leave navigation itself unguarded.
	React.useEffect(() => {
		const hardware =
			Platform.OS === 'android'
				? BackHandler.addEventListener('hardwareBackPress', () => {
						back();
						return true;
					})
				: undefined;
		const keydown = (event: KeyboardEvent) => {
			if (event.key !== 'Escape' || event.defaultPrevented) return;
			const target = event.target;
			if (
				target instanceof Element &&
				target.closest('input, textarea, [contenteditable]:not([contenteditable="false"])')
			)
				return;
			if (document.querySelector('[role="dialog"]')) return;
			event.preventDefault();
			back();
		};
		if (escape && typeof document !== 'undefined') document.addEventListener('keydown', keydown);
		return () => {
			hardware?.remove();
			if (escape && typeof document !== 'undefined')
				document.removeEventListener('keydown', keydown);
		};
	}, [back, escape]);
}
