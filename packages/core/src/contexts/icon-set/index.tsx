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
/** The stored value, or the default when it is absent or names a set that no longer exists. */
export function resolveIconSet(value: unknown): IconSetId {
	return ICON_SET_IDS.includes(value as IconSetId) ? (value as IconSetId) : DEFAULT_ICON_SET;
}

export function IconSetSettingProvider({ children }: { children: React.ReactNode }) {
	const { store } = useAppState();
	const set = resolveIconSet(useDocField(store, (latest) => latest.icons));

	return <IconSetProvider set={set}>{children}</IconSetProvider>;
}
