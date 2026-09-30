import type * as React from 'react';

/**
 * Only the desktop shell draws no native title bar; everywhere else the OS owns
 * the top of the window and there is nothing to reserve. See the `.electron` variant.
 */
export function DesktopWindowChrome({ children }: React.PropsWithChildren) {
	return children;
}
