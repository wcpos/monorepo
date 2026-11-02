import * as React from 'react';

import { ICON_SET_IDS, type IconSetId, IconSetProvider } from '@wcpos/components/icon';
import { iconSetForTheme } from '@wcpos/components/lib/themes';
import { useDocField } from '@wcpos/query';

import { useAppState } from '../app-state';

/** An explicit family wins; auto, absent and retired values follow the theme (decision 45). */
export function resolveIconSet(value: unknown, theme: string | undefined): IconSetId {
	return ICON_SET_IDS.includes(value as IconSetId) ? (value as IconSetId) : iconSetForTheme(theme);
}

/** Carries the store's icon rule to every Icon; no store still draws the default family. */
export function IconSetSettingProvider({ children }: { children: React.ReactNode }) {
	const { store } = useAppState();
	const icons = useDocField(store, (latest) => latest.icons);
	const theme = useDocField(store, (latest) => latest.theme);
	const set = resolveIconSet(icons, theme);

	return <IconSetProvider set={set}>{children}</IconSetProvider>;
}
