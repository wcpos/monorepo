import * as React from 'react';

import { loadAsync } from 'expo-font';

import { FONT_FACES } from '@wcpos/components/lib/fonts';
import { SYSTEM_TYPE, ThemeTraitsContext } from '@wcpos/components/lib/theme-traits';
import {
	familiesForType,
	traitsForTheme,
	TYPE_SET_IDS,
	TYPE_SETS,
	typeSetForTheme,
	type TypeSetId,
} from '@wcpos/components/lib/themes';
import { useDocField } from '@wcpos/query';

import { useAppState } from '../app-state';

/** An explicit set wins; auto, absent and retired values follow the theme (decision 45). */
export function resolveTypeSet(value: unknown, theme: string | undefined): TypeSetId {
	return TYPE_SET_IDS.includes(value as TypeSetId) ? (value as TypeSetId) : typeSetForTheme(theme);
}

export function ThemeTraitsSettingProvider({ children }: { children: React.ReactNode }) {
	const { store } = useAppState();
	const theme = useDocField(store, (latest) => latest.theme) ?? 'system';
	const fonts = useDocField(store, (latest) => latest.fonts);
	const setId = resolveTypeSet(fonts, theme);
	const [state, setState] = React.useState<{
		setId: TypeSetId;
		status: 'loaded' | 'failed';
	} | null>(null);

	// Font registration is an external side effect: only publish a set's type after it completes.
	React.useEffect(() => {
		const families = familiesForType(TYPE_SETS[setId]);
		if (families.length === 0) {
			// eslint-disable-next-line react-hooks/set-state-in-effect -- No faces means already loaded.
			setState({ setId, status: 'loaded' });
			return;
		}
		// A quick second switch can resolve out of order: a stale result must not overwrite the new set's.
		let stale = false;
		loadAsync(families.map((family) => FONT_FACES[family])).then(
			() => {
				if (!stale) setState({ setId, status: 'loaded' });
			},
			(error) => {
				if (stale) return;
				console.warn('Failed to load theme fonts', error);
				setState({ setId, status: 'failed' });
			}
		);
		return () => {
			stale = true;
		};
	}, [setId]);

	const value = React.useMemo(
		() => ({
			...traitsForTheme(theme),
			type: state?.status === 'loaded' && state.setId === setId ? TYPE_SETS[setId] : SYSTEM_TYPE,
		}),
		[state, theme, setId]
	);
	return <ThemeTraitsContext.Provider value={value}>{children}</ThemeTraitsContext.Provider>;
}
