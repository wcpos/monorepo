import * as React from 'react';
import { Text } from 'react-native';

import { act, render } from '@testing-library/react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';

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

function TopInset() {
	const { top, bottom } = useSafeAreaInsets();
	return <Text testID="insets">{`${top}/${bottom}`}</Text>;
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
	it('adds the title-bar strip to the top inset and leaves the others alone', async () => {
		overlay.visible = true;
		overlay.height = 40;
		const screen = await renderChrome();
		expect(screen.getByTestId('insets').props.children).toBe('60/34');
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
