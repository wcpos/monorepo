import * as React from 'react';

/**
 * The desktop shell's title-bar strip — the band under the OS window controls that
 * `DesktopWindowChrome` reserves (apps/main). It is the window's title bar, owned by
 * the drawer layout's `TitleBarStripContent` (Paul, 2026-10-29). The chrome publishes
 * a host node here; anywhere without one (web, tablet, phone, native) there is no
 * title bar. Its height is part of the top edge: `EdgeSurface` pads it once.
 */
export interface TitleBarStripHost {
	/** The DOM node inside the strip, sized to the title-bar area (clear of the controls). */
	node: HTMLElement | null;
	/** The strip's height in CSS px; 0 when the controls are hidden (macOS full screen). */
	height: number;
}

const TitleBarStripContext = React.createContext<TitleBarStripHost>({ node: null, height: 0 });

export const TitleBarStripProvider = TitleBarStripContext.Provider;

export function useTitleBarStrip(): TitleBarStripHost {
	return React.useContext(TitleBarStripContext);
}
