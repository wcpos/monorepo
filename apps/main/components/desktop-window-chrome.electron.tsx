import * as React from 'react';

import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUniwind } from 'uniwind';

import type { TypedIpcRenderer, WindowColorScheme } from '@wcpos/printer/ipc-channels';

/**
 * The desktop shell hides the native title bar (wcpos/electron src/main/title-bar.ts)
 * and leaves the OS window controls floating over the top of the page: macOS's
 * traffic lights at the top-left, Windows/Linux's min/max/close at the top-right.
 * Chromium reports that strip through the Window Controls Overlay API.
 *
 * Every surface that reaches the top of the window — the rail, the register bar,
 * the drawer header, page bars, sheets and dialogs — already pads by
 * `insets.top` for the phone status bar, so the strip is reserved the same way:
 * it is added to the top inset here and nothing screen-level knows about it. The
 * strip itself is the drag region (apps/main/public/index.html). It collapses to 0
 * when the controls are hidden, e.g. macOS full screen.
 */
interface WindowControlsOverlay extends EventTarget {
	visible: boolean;
	getTitlebarAreaRect(): DOMRect;
}

function getWindowControlsOverlay(): WindowControlsOverlay | undefined {
	if (typeof navigator === 'undefined') return undefined;
	return (navigator as Navigator & { windowControlsOverlay?: WindowControlsOverlay })
		.windowControlsOverlay;
}

function readTitleBarHeight(): number {
	const overlay = getWindowControlsOverlay();
	if (!overlay?.visible) return 0;
	return Math.round(overlay.getTitlebarAreaRect().height);
}

function subscribeToTitleBarGeometry(onChange: () => void): () => void {
	const overlay = getWindowControlsOverlay();
	if (!overlay) return () => {};
	overlay.addEventListener('geometrychange', onChange);
	return () => overlay.removeEventListener('geometrychange', onChange);
}

export function useTitleBarHeight(): number {
	return React.useSyncExternalStore(subscribeToTitleBarGeometry, readTitleBarHeight, () => 0);
}

function TitleBarInsets({ children }: React.PropsWithChildren) {
	const insets = useSafeAreaInsets();
	const titleBarHeight = useTitleBarHeight();
	const value = React.useMemo(
		() => ({ ...insets, top: insets.top + titleBarHeight }),
		[insets, titleBarHeight]
	);
	return <SafeAreaInsetsContext.Provider value={value}>{children}</SafeAreaInsetsContext.Provider>;
}

/**
 * Windows/Linux draw the window-control glyphs over the page and default their
 * colour to the OS theme, not ours. Every theme but `light` has a dark rail.
 * A leaf, like the auth stack's ThemedSystemBars: `useUniwind` re-renders on
 * every theme change and must not drag the whole tree with it.
 */
export function windowColorScheme(theme: string): WindowColorScheme {
	return theme === 'light' ? 'light' : 'dark';
}

function WindowColorSchemeSync(): null {
	const { theme } = useUniwind();
	React.useEffect(() => {
		const ipcRenderer =
			typeof window === 'undefined'
				? undefined
				: (window as unknown as { ipcRenderer?: Pick<TypedIpcRenderer, 'send'> }).ipcRenderer;
		try {
			ipcRenderer?.send('window-color-scheme', windowColorScheme(theme));
		} catch {
			// A shell older than this channel throws from its allowlist; glyph colour
			// is not worth a boot crash.
		}
	}, [theme]);
	return null;
}

export function DesktopWindowChrome({ children }: React.PropsWithChildren) {
	return (
		<TitleBarInsets>
			<WindowColorSchemeSync />
			{children}
		</TitleBarInsets>
	);
}
