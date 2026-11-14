import * as React from 'react';

import { Uniwind } from 'uniwind';

import { IconSetProvider } from '@wcpos/components/icon';
import { ThemeTraitsContext } from '@wcpos/components/lib/theme-traits';
import { isThemeName, traitsForTheme } from '@wcpos/components/lib/themes';
import { useDocField } from '@wcpos/query';

import { useAppState } from '../app-state';
import { resolveIconSet } from '../icon-set';
import { resolveTypeSet, useThemeType } from '../theme-traits';

/** The store's appearance choice as saved; `undefined` with no store or nothing saved. */
interface ThemeSetting {
	/** A theme name, `system`, or a retired name. */
	theme: string | undefined;
	icons: string | undefined;
	fonts: string | undefined;
}

const ThemeSettingContext = React.createContext<ThemeSetting>({
	theme: undefined,
	icons: undefined,
	fonts: undefined,
});

export const useThemeSetting = () => React.useContext(ThemeSettingContext);

/**
 * The one owner of the store's appearance: it reads the theme, icons and fonts from the store
 * once, applies the theme to Uniwind, and hands every screen the theme's traits and icon family.
 * No store still draws the default family and system type, so the auth screens have both.
 */
export function ThemeSettingProvider({ children }: { children: React.ReactNode }) {
	const { store } = useAppState();
	const theme = useDocField(store, (latest) => latest.theme);
	const icons = useDocField(store, (latest) => latest.icons);
	const fonts = useDocField(store, (latest) => latest.fonts);

	// On startup and on every store switch, before the first frame paints. Keyed on the store alone:
	// a theme picked in Settings is applied there, on the press. The document is read here, not the
	// field above, which still holds the previous store's value in the render a switch lands in.
	// `system` (or no saved theme) is applied too: on a store switch, skipping it would leave the
	// previous store's theme on screen. An unknown name also falls back to `system`, because
	// Uniwind throws on a theme it has not registered.
	React.useLayoutEffect(() => {
		if (!store) return;
		Uniwind.setTheme(isThemeName(store.theme) ? store.theme : 'system');
	}, [store]);

	const { type } = useThemeType(resolveTypeSet(fonts, theme));
	const traits = React.useMemo(() => ({ ...traitsForTheme(theme), type }), [theme, type]);
	const setting = React.useMemo(() => ({ theme, icons, fonts }), [theme, icons, fonts]);

	return (
		<ThemeSettingContext.Provider value={setting}>
			<IconSetProvider set={resolveIconSet(icons, theme)}>
				<ThemeTraitsContext.Provider value={traits}>{children}</ThemeTraitsContext.Provider>
			</IconSetProvider>
		</ThemeSettingContext.Provider>
	);
}
