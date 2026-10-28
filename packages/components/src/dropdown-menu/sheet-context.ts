import { Platform } from 'react-native';

import * as DropdownMenuPrimitive from '@rn-primitives/dropdown-menu';

import { useOverlayPresentation } from '../lib/overlay';

import type { SurfaceRole } from '../pressable-surface';

/** On the phone sheet no primitive Content is mounted: the parts draw Views, a row closes the menu. */
export function useMenuSheet() {
	const { onOpenChange } = DropdownMenuPrimitive.useRootContext();
	return useOverlayPresentation() === 'bottom' ? { close: () => onOpenChange(false) } : null;
}

/**
 * The sheet rows' roles. Web takes the ARIA menu-item roles the anchored primitive gives its
 * items; native has no menuitemcheckbox or menuitemradio, so VoiceOver and TalkBack get the
 * checkbox and radio roles they announce (Codex review, monorepo#2215). An accessibility
 * table, not overlay plumbing: the shell owns that.
 */
export const SHEET_ROW_ROLES: { checkbox: SurfaceRole; radio: SurfaceRole } =
	Platform.OS === 'web'
		? { checkbox: 'menuitemcheckbox', radio: 'menuitemradio' }
		: { checkbox: 'checkbox', radio: 'radio' };
