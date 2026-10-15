import * as React from 'react';
import { BackHandler } from 'react-native';

import { useFocusEffect } from 'expo-router';

/**
 * Android's back for the browse stack: `handle` answers whether it went back; `false` leaves
 * the press to the system (the navigator, then the app's exit).
 *
 * On a gesture-navigation phone the system owns the strip at the screen's edge, so the level's
 * own edge swipe (`LevelBack`) never starts there, and a back gesture from inside a level left
 * the app for the launcher (Pixel, 2026-10-06). Subscribed while the screen is focused, so a
 * covered tab or a modal over the register never answers it, and ONCE per focus with the latest
 * handler read through a ref: re-subscribing on every move of the path would put this listener
 * in front of a sheet opened over the level (Android serves the newest listener first).
 */
export function useSystemBack(handle: () => boolean): void {
	const latest = React.useRef(handle);
	React.useLayoutEffect(() => {
		latest.current = handle;
	});
	useFocusEffect(
		React.useCallback(() => {
			const subscription = BackHandler.addEventListener('hardwareBackPress', () =>
				latest.current()
			);
			return () => subscription.remove();
		}, [])
	);
}
