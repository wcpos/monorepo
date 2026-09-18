import * as React from 'react';
import { Platform } from 'react-native';

import { act, renderHook } from '@testing-library/react';

import { DeviceScope, useIsPhone, usePointer } from './device';

const mockDimensions = { width: 639, height: 800, scale: 1, fontScale: 1 };
jest.mock('react-native', () => ({
	Platform: { OS: 'web' },
	useWindowDimensions: () => mockDimensions,
}));

const originalMatchMedia = window.matchMedia;
afterEach(() => {
	window.matchMedia = originalMatchMedia;
});

it('keeps room keyed only by the existing 640px boundary', () => {
	const { result, rerender } = renderHook(useIsPhone);
	expect(result.current).toBe(true);
	mockDimensions.width = 640;
	rerender();
	expect(result.current).toBe(false);
});

it('follows both web media queries and removes its change listener on unmount', () => {
	Platform.OS = 'web';
	const media = new Map<string, { matches: boolean; listeners: Set<() => void> }>();
	window.matchMedia = jest.fn((query: string) => {
		const state = { matches: true, listeners: new Set<() => void>() };
		media.set(query, state);
		return {
			media: query,
			get matches() {
				return state.matches;
			},
			onchange: null,
			addEventListener: (_: string, fn: () => void) => state.listeners.add(fn),
			removeEventListener: (_: string, fn: () => void) => state.listeners.delete(fn),
			addListener: jest.fn(),
			removeListener: jest.fn(),
			dispatchEvent: () => true,
		} as unknown as MediaQueryList;
	});
	const { result, unmount } = renderHook(usePointer);
	expect(result.current).toBe('fine');
	for (const state of media.values()) {
		act(() => {
			state.matches = false;
			state.listeners.forEach((notify) => notify());
		});
		expect(result.current).toBe('coarse');
		act(() => {
			state.matches = true;
			state.listeners.forEach((notify) => notify());
		});
		expect(result.current).toBe('fine');
	}
	expect([...media.keys()]).toEqual(['(pointer: fine)', '(hover: hover)']);
	unmount();
	for (const state of media.values()) expect(state.listeners.size).toBe(0);
});

it.each(['ios', 'android'] as const)('always returns coarse on %s, even with a trackpad', (os) => {
	Platform.OS = os;
	window.matchMedia = () => {
		throw new Error('native must not query web input');
	};
	expect(renderHook(usePointer).result.current).toBe('coarse');
});

it.each([
	[true, 1200],
	[false, 320],
])('DeviceScope phone=%s overrides width %s', (phone, width) => {
	mockDimensions.width = width as number;
	const { result } = renderHook(useIsPhone, {
		wrapper: ({ children }) =>
			React.createElement(DeviceScope, { phone: phone as boolean }, children),
	});
	expect(result.current).toBe(phone);
});

it('DeviceScope overrides pointer while keeping the media subscription mounted', () => {
	Platform.OS = 'web';
	const addEventListener = jest.fn();
	const removeEventListener = jest.fn();
	window.matchMedia = jest.fn(
		() => ({ matches: false, addEventListener, removeEventListener }) as unknown as MediaQueryList
	);
	const { result, rerender, unmount } = renderHook(usePointer, {
		wrapper: ({ children }) => React.createElement(DeviceScope, { pointer: 'fine' }, children),
	});
	expect(result.current).toBe('fine');
	rerender();
	expect(addEventListener).toHaveBeenCalledTimes(2);
	unmount();
	expect(removeEventListener).toHaveBeenCalledTimes(2);
});

it('nested DeviceScopes merge rather than clearing an outer phone override', () => {
	Platform.OS = 'ios';
	mockDimensions.width = 1200;
	const { result } = renderHook(() => [useIsPhone(), usePointer()], {
		wrapper: ({ children }) =>
			React.createElement(
				DeviceScope,
				{ phone: true, pointer: 'coarse' },
				React.createElement(DeviceScope, { pointer: 'fine' }, children)
			),
	});
	expect(result.current).toEqual([true, 'fine']);
});
