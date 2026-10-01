import * as React from 'react';

import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUniwind } from 'uniwind';

import { TitleBarStripProvider } from '@wcpos/core/contexts/title-bar-strip';
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
/** The strip's area clear of the OS controls, as `left:width:height` so the store compares by value. */
function readTitleBarArea(): string {
	const overlay = getWindowControlsOverlay();
	if (!overlay?.visible) return '0:0:0';
	const rect = overlay.getTitlebarAreaRect();
	return `${Math.round(rect.x)}:${Math.round(rect.width)}:${Math.round(rect.height)}`;
}
function useTitleBarArea(): { left: number; width: number; height: number } {
	const area = React.useSyncExternalStore(
		subscribeToTitleBarGeometry,
		readTitleBarArea,
		() => '0:0:0'
	);
	return React.useMemo(() => {
		const [left, width, height] = area.split(':').map(Number);
		return { left, width, height };
	}, [area]);
}
/**
 * The strip is the till's topmost row on the desktop: the register bar portals into
 * this node (core's `TitleBarStripPortal`). It sits over the drag region, sized to the
 * title-bar area so it never covers the traffic lights or the Windows controls; its
 * buttons are `no-drag` by the global rule in public/index.html.
 */
function TitleBarStripHost({ children }: React.PropsWithChildren) {
	const { left, width, height } = useTitleBarArea();
	const [node, setNode] = React.useState<HTMLElement | null>(null);
	const value = React.useMemo(() => ({ node: height > 0 ? node : null, height }), [node, height]);
	return (
		<TitleBarStripProvider value={value}>
			{children}
			<div
				ref={setNode}
				data-testid="title-bar-strip"
				style={{
					position: 'fixed',
					top: 0,
					left,
					width,
					height,
					zIndex: 40,
					display: height > 0 ? 'flex' : 'none',
					flexDirection: 'column',
				}}
			/>
		</TitleBarStripProvider>
	);
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
			<TitleBarStripHost>{children}</TitleBarStripHost>
		</TitleBarInsets>
	);
}
