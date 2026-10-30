import * as React from 'react';

import { loadAsync } from 'expo-font';

import { FONT_FACES } from '@wcpos/components/lib/fonts';
import { SYSTEM_TYPE, ThemeTraitsContext } from '@wcpos/components/lib/theme-traits';
import { familiesForTheme, THEME_TYPE, type ThemeName } from '@wcpos/components/lib/themes';
import { useDocField } from '@wcpos/query';

import { useAppState } from '../app-state';

export function ThemeTraitsSettingProvider({ children }: { children: React.ReactNode }) {
	const { store } = useAppState();
	const theme = useDocField(store, (latest) => latest.theme) ?? 'system';
	const [state, setState] = React.useState<{ theme: string; status: 'loaded' | 'failed' } | null>(
		null
	);

	// Font registration is an external side effect: only publish a theme's type after it completes.
	React.useEffect(() => {
		const families = familiesForTheme(theme);
		if (families.length === 0) {
			// eslint-disable-next-line react-hooks/set-state-in-effect -- No faces means already loaded.
			setState({ theme, status: 'loaded' });
			return;
		}
		// A quick second switch can resolve out of order: a stale result must not overwrite the new theme's.
		let stale = false;
		loadAsync(families.map((family) => FONT_FACES[family])).then(
			() => {
				if (!stale) setState({ theme, status: 'loaded' });
			},
			(error) => {
				if (stale) return;
				console.warn('Failed to load theme fonts', error);
				setState({ theme, status: 'failed' });
			}
		);
		return () => {
			stale = true;
		};
	}, [theme]);

	const value = React.useMemo(
		() => ({
			type:
				state?.status === 'loaded' && state.theme === theme
					? (THEME_TYPE[theme as ThemeName] ?? SYSTEM_TYPE)
					: SYSTEM_TYPE,
		}),
		[state, theme]
	);
	return <ThemeTraitsContext.Provider value={value}>{children}</ThemeTraitsContext.Provider>;
}
