import { Platform } from 'react-native';

import { act, renderHook } from '@testing-library/react';

import { useIsPhone, usePointer } from './device';

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
