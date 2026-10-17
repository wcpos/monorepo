import { act, renderHook } from '@testing-library/react';

import { MAX_SIDE_SLOP, MIN_TARGET, useMinTargetSlop } from './min-target';

let mockOS = 'ios';
jest.mock('react-native', () => ({
	Platform: {
		get OS() {
			return mockOS;
		},
	},
}));

const layout = (height: number, width = 80) => ({
	nativeEvent: { layout: { x: 0, y: 0, width, height } },
});

beforeEach(() => {
	mockOS = 'ios';
});

it.each([
	[36, 4], // Regular h-9
	[31.5, 7], // Compact h-9
	[32, 6], // Regular Chip sm h-8
	[28, 8], // Compact Chip sm
])('grows a %s pt tall control to a 44 pt target, not sideways when wide', (height, slop) => {
	const { result } = renderHook(() => useMinTargetSlop(true));
	act(() => result.current.onLayout!(layout(height) as never));
	expect(result.current.hitSlop).toEqual({ top: slop, bottom: slop, left: 0, right: 0 });
	expect(height + 2 * slop).toBeGreaterThanOrEqual(MIN_TARGET);
});

it('adds nothing to a control already 44 tall (Spacious, or a coarse floor)', () => {
	const { result } = renderHook(() => useMinTargetSlop(true));
	act(() => result.current.onLayout!(layout(45) as never));
	expect(result.current.hitSlop).toBeUndefined();
});

it('keeps the caller onLayout and measures nothing when off or on the web', () => {
	const own = jest.fn();
	const off = renderHook(() => useMinTargetSlop(false, own));
	expect(off.result.current.onLayout).toBe(own);
	expect(off.result.current.hitSlop).toBeUndefined();
	mockOS = 'web';
	const web = renderHook(() => useMinTargetSlop(true, own));
	expect(web.result.current.onLayout).toBe(own);
	mockOS = 'ios';
	const on = renderHook(() => useMinTargetSlop(true, own));
	act(() => on.result.current.onLayout!(layout(36) as never));
	expect(own).toHaveBeenCalledTimes(1);
});

it('grows a narrow control sideways by at most half the 8 pt gap between targets', () => {
	const { result } = renderHook(() => useMinTargetSlop(true));
	act(() => result.current.onLayout!(layout(36, 34) as never));
	expect(result.current.hitSlop).toEqual({ top: 4, bottom: 4, left: 4, right: 4 });
	act(() => result.current.onLayout!(layout(36, 42) as never));
	expect(result.current.hitSlop).toEqual({ top: 4, bottom: 4, left: 1, right: 1 });
	expect(MAX_SIDE_SLOP * 2).toBeLessThanOrEqual(8);
});
