/** @jest-environment jsdom */
import { Platform } from 'react-native';

import { act, renderHook } from '@testing-library/react';

import { useRowKeyboard } from './use-row-keyboard';

const ids = ['a', 'b'];
function setup() {
	const open = jest.fn();
	const scroll = jest.fn();
	const hook = renderHook(() => useRowKeyboard(ids, open, scroll));
	const key = (key: string) =>
		act(() =>
			hook.result.current.onKeyDown?.({
				nativeEvent: { key },
				target: document.body,
				preventDefault: jest.fn(),
			} as unknown as Parameters<NonNullable<typeof hook.result.current.onKeyDown>>[0])
		);
	return { ...hook, key, open, scroll };
}
it('moves focus, scrolls and opens on Enter; Escape is not the list key', () => {
	const { key, result, open, scroll } = setup();
	key('ArrowDown');
	expect(result.current.focusIndex).toBe(0);
	key('ArrowDown');
	expect(result.current.focusIndex).toBe(1);
	key('ArrowDown');
	expect(result.current.focusIndex).toBe(1);
	expect(scroll).toHaveBeenLastCalledWith(1);
	key('Enter');
	expect(open).toHaveBeenLastCalledWith('b');
	key('ArrowUp');
	key('Enter');
	expect(open).toHaveBeenLastCalledWith('a');
	key('Escape');
	expect(open).toHaveBeenCalledTimes(2);
});
it('rings the row after a keyboard move, never after a click', () => {
	const { key, result } = setup();
	key('ArrowDown');
	expect(result.current.ring).toBe(true);
	// The focus event that follows the hook's own move keeps the ring.
	act(() => result.current.focusFrom(0));
	expect(result.current.ring).toBe(true);
	// A click (its focus event arrives with no key behind it) drops it.
	act(() => result.current.focusFrom(1));
	expect(result.current.focusIndex).toBe(1);
	expect(result.current.ring).toBe(false);
});
it('does nothing on native', () => {
	const old = Platform.OS;
	Platform.OS = 'ios';
	try {
		expect(setup().result.current.onKeyDown).toBeUndefined();
	} finally {
		Platform.OS = old;
	}
});
it('does not intercept a control inside a row', () => {
	const { result, open } = setup();
	act(() =>
		result.current.onKeyDown?.({
			nativeEvent: { key: 'Enter' },
			target: document.createElement('button'),
			preventDefault: jest.fn(),
		} as unknown as Parameters<NonNullable<typeof result.current.onKeyDown>>[0])
	);
	expect(open).not.toHaveBeenCalled();
});
