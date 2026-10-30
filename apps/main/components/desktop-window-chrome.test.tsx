import * as React from 'react';
import { Text } from 'react-native';

import { act, render } from '@testing-library/react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';

import { type Edge, EdgeSurface, useEdgeInsets } from '@wcpos/components/edge-surface';

import { DesktopWindowChrome, windowColorScheme } from './desktop-window-chrome.electron';

const mockTheme = { current: 'dark' };
jest.mock('uniwind', () => ({ useUniwind: () => ({ theme: mockTheme.current }) }));

/** The Window Controls Overlay as Chromium exposes it under a hidden title bar. */
class FakeOverlay extends EventTarget {
	visible = true;
	height = 40;
	getTitlebarAreaRect() {
		return { x: 80, y: 0, width: 944, height: this.height } as DOMRect;
	}
	change(visible: boolean, height: number) {
		this.visible = visible;
		this.height = height;
		this.dispatchEvent(new Event('geometrychange'));
	}
}

const overlay = new FakeOverlay();
const send = jest.fn();
const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

beforeEach(() => {
	send.mockReset();
	Object.defineProperty(globalThis, 'navigator', {
		value: { windowControlsOverlay: overlay },
		configurable: true,
	});
	(window as unknown as { ipcRenderer?: { send: typeof send } }).ipcRenderer = { send };
});

afterEach(() => {
	if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
	delete (window as unknown as { ipcRenderer?: unknown }).ipcRenderer;
});

/** What a surface on the top edge pads, and the bottom inset, which the strip never touches. */
function TopInset() {
	const { paddingTop = 0 } = useEdgeInsets(['top']);
	const { bottom } = useSafeAreaInsets();
	return <Text testID="insets">{`${paddingTop}/${bottom}`}</Text>;
}

/** The status-bar insets the provider above would report (phone-shaped on purpose). */
const deviceInsets = { top: 20, bottom: 34, left: 0, right: 0 };

function renderChrome() {
	return render(
		<SafeAreaInsetsContext.Provider value={deviceInsets}>
			<DesktopWindowChrome>
				<TopInset />
			</DesktopWindowChrome>
		</SafeAreaInsetsContext.Provider>
	);
}

describe('DesktopWindowChrome (electron)', () => {
	it('pads the title-bar strip with the top inset and leaves the others alone', async () => {
		overlay.visible = true;
		overlay.height = 40;
		const screen = await renderChrome();
		expect(screen.getByTestId('insets').props.children).toBe('60/34');
	});

	// The strip is padded once: by the first surface on the top edge, or by a ground that takes
	// the strip alone (the POS root), whose columns then pad only the status bar.
	it.each<[readonly Edge[], string]>([
		[['top'], '0/34'],
		[['strip'], '20/34'],
	])('pads the strip once under a surface on %j', async (edges, expected) => {
		overlay.visible = true;
		overlay.height = 40;
		const screen = await render(
			<SafeAreaInsetsContext.Provider value={deviceInsets}>
				<DesktopWindowChrome>
					<EdgeSurface edges={edges}>
						<TopInset />
					</EdgeSurface>
				</DesktopWindowChrome>
			</SafeAreaInsetsContext.Provider>
		);
		expect(screen.getByTestId('insets').props.children).toBe(expected);
	});

	it('follows the overlay when the controls hide, e.g. macOS full screen', async () => {
		overlay.visible = true;
		overlay.height = 40;
		const screen = await renderChrome();
		await act(async () => overlay.change(false, 0));
		expect(screen.getByTestId('insets').props.children).toBe('20/34');
		await act(async () => overlay.change(true, 40));
		expect(screen.getByTestId('insets').props.children).toBe('60/34');
	});

	// The title bar is its own chrome (Paul, 2026-10-29): a band in the rail's surface with a rule
	// under it, behind the strip, only while the OS band has height; and the strip's controls are
	// its own height (the control token, scoped to the strip).
	it('paints the title-bar band only while the OS band has height', async () => {
		overlay.visible = true;
		overlay.height = 28;
		const screen = await renderChrome();
		const byDataTestId = (id: string) =>
			screen.container.queryAll((node) => node.props['data-testid'] === id);
		expect(byDataTestId('title-bar-band')).toHaveLength(1);
		expect(byDataTestId('title-bar-band')[0].props.style).toMatchObject({
			height: 28,
			background: 'var(--rail)',
		});
		expect(byDataTestId('title-bar-strip')[0].props.style['--spacing-ctl']).toBe('28px');
		await act(async () => overlay.change(false, 0));
		expect(byDataTestId('title-bar-band')).toHaveLength(0);
		await act(async () => overlay.change(true, 40));
	});

	it('reserves nothing without a Window Controls Overlay (a browser tab)', async () => {
		Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
		const screen = await renderChrome();
		expect(screen.getByTestId('insets').props.children).toBe('20/34');
	});

	it('reports the theme to the shell as a light/dark scheme, once per change', async () => {
		mockTheme.current = 'ocean';
		const screen = await renderChrome();
		expect(send).toHaveBeenCalledTimes(1);
		expect(send).toHaveBeenLastCalledWith('window-color-scheme', 'dark');
		mockTheme.current = 'light';
		await screen.rerender(
			<SafeAreaInsetsContext.Provider value={deviceInsets}>
				<DesktopWindowChrome>
					<TopInset />
				</DesktopWindowChrome>
			</SafeAreaInsetsContext.Provider>
		);
		expect(send).toHaveBeenCalledTimes(2);
		expect(send).toHaveBeenLastCalledWith('window-color-scheme', 'light');
	});
});

describe('DesktopWindowChrome (electron) on an older shell', () => {
	it('survives a preload that does not allow the channel yet', async () => {
		send.mockImplementation(() => {
			throw new Error('Channel window-color-scheme is not allowed');
		});
		const screen = await renderChrome();
		expect(screen.getByTestId('insets').props.children).toBe('60/34');
		expect(send).toHaveBeenCalledTimes(1);
	});
});

describe('windowColorScheme', () => {
	it('is light only for the light theme: every other theme has a dark rail', async () => {
		expect(windowColorScheme('light')).toBe('light');
		for (const dark of ['dark', 'ocean', 'sunset', 'monochrome']) {
			expect(windowColorScheme(dark)).toBe('dark');
		}
	});
});
