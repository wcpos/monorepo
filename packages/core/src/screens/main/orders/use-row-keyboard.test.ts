/** @jest-environment jsdom */
import { Platform } from 'react-native';

import { act, renderHook } from '@testing-library/react';

import { useRowKeyboard } from './use-row-keyboard';

const ids = ['a', 'b'];
function setup() {
	const select = jest.fn();
	const scroll = jest.fn();
	const hook = renderHook(() => useRowKeyboard(ids, select, scroll));
	const key = (key: string) =>
		act(() =>
			hook.result.current.onKeyDown?.({
				nativeEvent: { key },
				target: document.body,
				preventDefault: jest.fn(),
			} as unknown as Parameters<NonNullable<typeof hook.result.current.onKeyDown>>[0])
		);
	return { ...hook, key, select, scroll };
}
it('moves focus, scrolls, opens on Enter and clears on Escape without selecting day headings', () => {
	const { key, result, select, scroll } = setup();
	key('ArrowDown');
	expect(result.current.focusIndex).toBe(0);
	key('ArrowDown');
	expect(result.current.focusIndex).toBe(1);
	key('ArrowDown');
	expect(result.current.focusIndex).toBe(1);
	expect(scroll).toHaveBeenLastCalledWith(1);
	key('Enter');
	expect(select).toHaveBeenLastCalledWith('b');
	key('ArrowUp');
	key('Enter');
	expect(select).toHaveBeenLastCalledWith('a');
	key('Escape');
	expect(select).toHaveBeenLastCalledWith(null);
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
	const { result, select } = setup();
	act(() =>
		result.current.onKeyDown?.({
			nativeEvent: { key: 'Enter' },
			target: document.createElement('button'),
			preventDefault: jest.fn(),
		} as unknown as Parameters<NonNullable<typeof result.current.onKeyDown>>[0])
	);
	expect(select).not.toHaveBeenCalled();
});
