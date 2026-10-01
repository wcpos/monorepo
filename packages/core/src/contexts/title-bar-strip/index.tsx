import * as React from 'react';

/**
 * The desktop shell's title-bar strip — the band under the OS window controls that
 * `DesktopWindowChrome` reserves (apps/main). On the desktop the strip is the till's
 * topmost row, so the register bar renders INTO it rather than above the cart
 * (roadmap prototype 2026-09-30-phone-md-chrome, desktop option 7). The chrome
 * publishes a host node here; anywhere without one (web, tablet, phone, native) the
 * bar stays where it is.
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
