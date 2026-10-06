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
			return {
				remove: () => {
					mockRemove(listener);
					mockListeners.splice(mockListeners.indexOf(listener), 1);
				},
			};
		},
	},
}));
// Android's dispatch (react-native/Libraries/Utilities/BackHandler.android.js): newest listener
// first, and the first to return `true` ends it. `false` from all of them is the system's back.
const pressBack = () => {
	for (let i = mockListeners.length - 1; i >= 0; i -= 1) if (mockListeners[i]()) return true;
	return false;
};

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
	const subscribed = mockListeners[0];
	unmount();
	expect(mockRemove).toHaveBeenCalledWith(subscribed);
});

// The inline variations sheet on the phone owns its dismiss and subscribes to back when it opens
// (OverlayShell, packages/components/src/lib/overlay.tsx; its own test is overlay.native.test.tsx).
// Opened over a level, its close must come first, and the level must stay.
it('a sheet opened over a level closes on back first; the level steps back only after', () => {
	const level = jest.fn();
	// A new handler every render, as the stage hands it.
	const handler = () => () => {
		level();
		return true;
	};
	const { rerender } = renderHook(({ handle }) => useSystemBack(handle), {
		initialProps: { handle: handler() },
	});
	const dismiss = jest.fn(() => true);
	const { unmount: closeSheet } = renderHook(() => {
		const ReactActual = jest.requireActual<typeof import('react')>('react');
		ReactActual.useEffect(() => {
			const { BackHandler } = jest.requireMock('react-native');
			const back = BackHandler.addEventListener('hardwareBackPress', dismiss);
			return () => back.remove();
		}, []);
	});
	// The level re-renders under the open sheet (a sync, the path's answer): no re-subscription
	// that would put it in front of the sheet.
	rerender({ handle: handler() });
	expect(pressBack()).toBe(true);
	expect(dismiss).toHaveBeenCalledTimes(1);
	expect(level).not.toHaveBeenCalled();
	closeSheet();
	expect(pressBack()).toBe(true);
	expect(level).toHaveBeenCalledTimes(1);
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
