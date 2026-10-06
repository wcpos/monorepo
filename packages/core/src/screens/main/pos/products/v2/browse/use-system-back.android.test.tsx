/** @jest-environment jsdom */
import { renderHook } from '@testing-library/react';

// The screen's focus, as the navigator gives it: the effect runs on focus, its cleanup on blur.
let mockFocused = true;
jest.mock('expo-router', () => ({
	useFocusEffect: (effect: () => () => void) => {
		const ReactActual = jest.requireActual('react');
		ReactActual.useEffect(() => (mockFocused ? effect() : undefined), [effect]);
	},
}));
const mockListeners: (() => boolean)[] = [];
const mockRemove = jest.fn();
jest.mock('react-native', () => ({
	BackHandler: {
		addEventListener: (_event: string, listener: () => boolean) => {
			mockListeners.push(listener);
			return { remove: () => mockRemove(listener) };
		},
	},
}));

/* eslint-disable import/first */
import { useSystemBack } from './use-system-back.android';
/* eslint-enable import/first */

beforeEach(() => {
	mockFocused = true;
	mockListeners.length = 0;
	mockRemove.mockClear();
});

it('answers Android back with the latest handler, subscribed once per focus', () => {
	const { rerender, unmount } = renderHook(({ handle }) => useSystemBack(handle), {
		initialProps: { handle: () => true },
	});
	expect(mockListeners).toHaveLength(1);
	expect(mockListeners[0]()).toBe(true);
	// A new handler every render (the path moved) is read through, not re-subscribed: a sheet
	// opened over the level subscribed after this one and must keep being served first.
	rerender({ handle: () => false });
	expect(mockListeners).toHaveLength(1);
	expect(mockListeners[0]()).toBe(false);
	unmount();
	expect(mockRemove).toHaveBeenCalledWith(mockListeners[0]);
});

it('a screen that is not focused (another tab, a modal over it) does not answer back', () => {
	mockFocused = false;
	renderHook(() => useSystemBack(() => true));
	expect(mockListeners).toHaveLength(0);
});

// The default (iOS, web) variant has no system back to answer.
it('is a no-op off Android', () => {
	const { useSystemBack: noop } =
		jest.requireActual<typeof import('./use-system-back')>('./use-system-back');
	const handle = jest.fn(() => true);
	renderHook(() => noop(handle));
	expect(handle).not.toHaveBeenCalled();
	expect(mockListeners).toHaveLength(0);
});
