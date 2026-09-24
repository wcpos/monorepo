import * as React from 'react';
import { Platform, type Role } from 'react-native';

export const SheetContext = React.createContext<{ close: () => void } | null>(null);
export const useMenuSheet = () => React.useContext(SheetContext);

/**
 * The sheet rows' roles. Web takes the ARIA menu-item roles the anchored primitive gives its
 * items; native has no menuitemcheckbox or menuitemradio, so VoiceOver and TalkBack get the
 * checkbox and radio roles they announce (Codex review, monorepo#2215). An accessibility
 * table, not overlay plumbing: the shell owns that.
 */
export const SHEET_ROW_ROLES: { checkbox: Role; radio: Role } =
	Platform.OS === 'web'
		? { checkbox: 'menuitemcheckbox' as Role, radio: 'menuitemradio' as Role }
		: { checkbox: 'checkbox', radio: 'radio' };

/** The sheet's section label text: the drawn `.opt.h2`, at the floor the design rule sets. */
export const SHEET_LABEL_TEXT =
	'text-muted-foreground text-sm font-semibold tracking-wide uppercase';
