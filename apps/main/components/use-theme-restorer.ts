import * as React from 'react';

import { Uniwind } from 'uniwind';

import { isThemeName } from '@wcpos/components/lib/themes';
import { useAppState } from '@wcpos/core/contexts/app-state';

/**
 * Restores the saved theme from the store document on app startup and on every
 * store switch. Returns true when theme restoration is complete.
 */
export function useThemeRestorer() {
	const { store } = useAppState();
	const [restoredForStore, setRestoredForStore] = React.useState<unknown>(null);
	const [isThemeReady, setIsThemeReady] = React.useState(false);

	// Adjust state during render — sanctioned pattern, not an effect, not flagged.
	if (store && restoredForStore !== store) {
		setRestoredForStore(store);
		setIsThemeReady(true);
	}

	// External mutation belongs in a pre-paint effect; read store.theme directly.
	// `system` (or no saved theme) is applied too: on a store switch, skipping it
	// would leave the previous store's theme on screen. An unknown name also falls
	// back to `system`, because Uniwind throws on a theme it has not registered.
	React.useLayoutEffect(() => {
		if (!store) return;
		Uniwind.setTheme(isThemeName(store.theme) ? store.theme : 'system');
	}, [store]);

	return { isThemeReady, hasStore: !!store };
}
