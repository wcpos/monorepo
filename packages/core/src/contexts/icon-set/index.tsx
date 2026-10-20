import * as React from 'react';

import {
	DEFAULT_ICON_SET,
	ICON_SET_IDS,
	type IconSetId,
	IconSetProvider,
} from '@wcpos/components/icon';
import { useDocField } from '@wcpos/query';

import { useAppState } from '../app-state';

/**
 * Carries the store's chosen icon family to every `Icon`, from the device-local
 * `icons` field the Settings > Theme screen writes.
 *
 * No store, an absent field or a value that is no longer a set all draw the
 * default family, so the auth screens and an old document have icons too.
 */
export function IconSetSettingProvider({ children }: { children: React.ReactNode }) {
	const { store } = useAppState();
	const icons = useDocField(store, (latest) => latest.icons);
	const set = ICON_SET_IDS.includes(icons as IconSetId) ? (icons as IconSetId) : DEFAULT_ICON_SET;

	return <IconSetProvider set={set}>{children}</IconSetProvider>;
}
