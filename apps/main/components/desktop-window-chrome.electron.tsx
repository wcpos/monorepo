import * as React from 'react';

import { useUniwind } from 'uniwind';

import { TitleBarStripProvider } from '@wcpos/components/edge-surface';
import type { TypedIpcRenderer, WindowColorScheme } from '@wcpos/printer/ipc-channels';

/**
 * The desktop shell hides the native title bar (wcpos/electron src/main/title-bar.ts)
 * and leaves the OS window controls floating over the top of the page: macOS's
 * traffic lights at the top-left, Windows/Linux's min/max/close at the top-right.
 * Chromium reports that strip through the Window Controls Overlay API.
 *
 * Every surface that reaches the top of the window — the rail, the drawer, page
 * bars — is an `EdgeSurface` on the top edge, which pads the strip's height with
 * the status bar's, once; the POS ground takes the strip alone and its columns
 * the status bar. So the strip's height is published here and nothing screen-level
 * adds or subtracts it. The strip itself is the drag region
 * (apps/main/public/index.html). It collapses to 0 when the controls are hidden,
 * e.g. macOS full screen.
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
 * The strip is the window's title bar (Paul, 2026-10-29): the drawer layout's
 * `TitleBarStripContent` portals into this node (`TitleBarStripPortal`,
 * `@wcpos/components/edge-surface`). It sits over the drag region, sized to the
 * title-bar area so it never covers the traffic lights or the Windows controls; its
 * buttons are `no-drag` by the global rule in public/index.html, and the control token
 * is the strip's height inside it. Behind it, full window width, the band paints the
 * rail's surface with a rule under it, so the strip reads as chrome, not page. Plain DOM:
 * the rail's CSS variables, not classes.
 */
function TitleBarStripHost({ children }: React.PropsWithChildren) {
	const { left, width, height } = useTitleBarArea();
	const [node, setNode] = React.useState<HTMLElement | null>(null);
	const value = React.useMemo(() => ({ node: height > 0 ? node : null, height }), [node, height]);
	return (
		<TitleBarStripProvider value={value}>
			{children}
			{height > 0 ? (
				<div
					data-testid="title-bar-band"
					style={{
						position: 'fixed',
						inset: '0 0 auto 0',
						height,
						zIndex: 39,
						pointerEvents: 'none',
						background: 'var(--rail)',
						borderBottom: '1px solid var(--rail-border)',
						boxSizing: 'border-box',
					}}
				/>
			) : null}
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
					['--spacing-ctl' as string]: `${height}px`,
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
		<>
			<WindowColorSchemeSync />
			<TitleBarStripHost>{children}</TitleBarStripHost>
		</>
	);
}
