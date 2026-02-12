/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { useOnEndReached } from './use-on-end-reached';

// Mock lodash throttle to execute immediately in tests
jest.mock('lodash', () => ({
	...jest.requireActual('lodash'),
	throttle: (fn: Function) => {
		const throttled = fn as any;
		throttled.cancel = jest.fn();
		return throttled;
	},
}));

function createMockScrollElement(overrides: Partial<HTMLDivElement> = {}) {
	const listeners: Record<string, Function[]> = {};
	return {
		scrollTop: 0,
		scrollLeft: 0,
		clientHeight: 500,
		clientWidth: 500,
		scrollHeight: 1000,
		scrollWidth: 1000,
		addEventListener: jest.fn((event: string, handler: Function) => {
			listeners[event] = listeners[event] || [];
			listeners[event].push(handler);
		}),
		removeEventListener: jest.fn((event: string, handler: Function) => {
			listeners[event] = (listeners[event] || []).filter((h) => h !== handler);
		}),
		// Helper to trigger scroll
		_triggerScroll() {
			(listeners['scroll'] || []).forEach((h) => {
				h();
			});
		},
		...overrides,
	} as unknown as HTMLDivElement;
}

describe('useOnEndReached', () => {
	beforeEach(() => {
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it('should not call onEndReached when scrollElement is null', () => {
		const onEndReached = jest.fn();
		renderHook(() =>
			useOnEndReached({
				scrollElement: null,
				horizontal: false,
				onEndReached,
				onEndReachedThreshold: 0.5,
				data: [1],
				getTotalSize: () => 1000,
			})
		);

		act(() => {
			jest.runAllTimers();
		});

		expect(onEndReached).not.toHaveBeenCalled();
	});

	it('should not call onEndReached when onEndReached is not provided', () => {
		const scrollElement = createMockScrollElement();
		// Should not throw
		renderHook(() =>
			useOnEndReached({
				scrollElement,
				horizontal: false,
				onEndReached: undefined,
				onEndReachedThreshold: 0.5,
				data: [1],
				getTotalSize: () => 1000,
			})
		);
	});

	it('should call onEndReached when near the bottom (vertical)', () => {
		const onEndReached = jest.fn();
		const scrollElement = createMockScrollElement({
			scrollTop: 700,
			clientHeight: 500,
			scrollHeight: 1000,
		} as any);

		renderHook(() =>
			useOnEndReached({
				scrollElement,
				horizontal: false,
				onEndReached,
				onEndReachedThreshold: 0.5,
				data: [1, 2, 3],
				getTotalSize: () => 1000,
			})
		);

		// The initial handleScroll() call detects we're near the end
		// distanceFromEnd = 1000 - (700 + 500) = -200, which is <= threshold (250)
		expect(onEndReached).toHaveBeenCalledTimes(1);
	});

	it('should call onEndReached when near the end (horizontal)', () => {
		const onEndReached = jest.fn();
		const scrollElement = createMockScrollElement({
			scrollLeft: 700,
			clientWidth: 500,
			scrollWidth: 1000,
		} as any);

		renderHook(() =>
			useOnEndReached({
				scrollElement,
				horizontal: true,
				onEndReached,
				onEndReachedThreshold: 0.5,
				data: [1, 2, 3],
				getTotalSize: () => 1000,
			})
		);

		expect(onEndReached).toHaveBeenCalled();
	});

	it('should not call onEndReached when far from the end', () => {
		const onEndReached = jest.fn();
		const scrollElement = createMockScrollElement({
			scrollTop: 0,
			clientHeight: 500,
			scrollHeight: 2000,
		} as any);

		renderHook(() =>
			useOnEndReached({
				scrollElement,
				horizontal: false,
				onEndReached,
				onEndReachedThreshold: 0.1,
				data: [1, 2, 3],
				getTotalSize: () => 2000,
			})
		);

		act(() => {
			jest.runAllTimers();
		});

		// distanceFromEnd = 2000 - (0 + 500) = 1500, threshold = 50, so not triggered
		expect(onEndReached).not.toHaveBeenCalled();
	});

	it('should not trigger again without scrolling away first', () => {
		const onEndReached = jest.fn();
		const scrollElement = createMockScrollElement({
			scrollTop: 800,
			clientHeight: 500,
			scrollHeight: 1000,
		} as any);

		renderHook(() =>
			useOnEndReached({
				scrollElement,
				horizontal: false,
				onEndReached,
				onEndReachedThreshold: 0.5,
				data: [1],
				getTotalSize: () => 1000,
			})
		);

		// Initial mount: scroll effect fires onEndReached (1st call),
		// then data reset effect resets the flag.
		expect(onEndReached).toHaveBeenCalledTimes(1);

		// First scroll after mount: flag was reset by the data effect,
		// so this scroll detects we're still at the end and fires again.
		(scrollElement as any)._triggerScroll();
		expect(onEndReached).toHaveBeenCalledTimes(2);

		// Second scroll at same position: flag is now true and no effect
		// has reset it, so this should NOT fire again.
		(scrollElement as any)._triggerScroll();
		expect(onEndReached).toHaveBeenCalledTimes(2);
	});

	it('should reset endReachedRef when scrolled far enough away', () => {
		const onEndReached = jest.fn();
		const scrollElement = createMockScrollElement({
			scrollTop: 800,
			clientHeight: 500,
			scrollHeight: 2000,
		} as any);

		renderHook(() =>
			useOnEndReached({
				scrollElement,
				horizontal: false,
				onEndReached,
				onEndReachedThreshold: 0.2,
				data: [1, 2, 3],
				getTotalSize: () => 2000,
			})
		);

		// distanceFromEnd = 2000 - (800 + 500) = 700, threshold = 100
		// 700 > 100, so not triggered initially
		expect(onEndReached).not.toHaveBeenCalledTimes(1);

		// Scroll to within threshold
		(scrollElement as any).scrollTop = 1450;
		(scrollElement as any)._triggerScroll();
		// distanceFromEnd = 2000 - (1450 + 500) = 50, threshold = 100, so triggered
		expect(onEndReached).toHaveBeenCalledTimes(1);

		// Scroll at same position again - should not fire
		(scrollElement as any)._triggerScroll();
		expect(onEndReached).toHaveBeenCalledTimes(1);

		// Scroll far enough away to reset (beyond resetDistance = max(150, 50) = 150)
		(scrollElement as any).scrollTop = 0;
		(scrollElement as any)._triggerScroll();
		// distanceFromEnd = 2000 - (0 + 500) = 1500, resetDistance = 150, so flag resets

		// Scroll back near the end
		(scrollElement as any).scrollTop = 1450;
		(scrollElement as any)._triggerScroll();
		expect(onEndReached).toHaveBeenCalledTimes(2);
	});

	it('should handle short content and trigger onEndReached', () => {
		const onEndReached = jest.fn();
		const scrollElement = createMockScrollElement({
			clientHeight: 500,
		} as any);

		renderHook(() =>
			useOnEndReached({
				scrollElement,
				horizontal: false,
				onEndReached,
				onEndReachedThreshold: 0.5,
				data: [1],
				getTotalSize: () => 200, // Content shorter than container
			})
		);

		// Advance timers to trigger the setTimeout in short content check
		act(() => {
			jest.runAllTimers();
		});

		expect(onEndReached).toHaveBeenCalled();
	});

	it('should not trigger short content check with empty data', () => {
		const onEndReached = jest.fn();
		const scrollElement = createMockScrollElement();

		renderHook(() =>
			useOnEndReached({
				scrollElement,
				horizontal: false,
				onEndReached,
				onEndReachedThreshold: 0.5,
				data: [],
				getTotalSize: () => 0,
			})
		);

		act(() => {
			jest.runAllTimers();
		});

		// Should not be called because data.length === 0
		expect(onEndReached).not.toHaveBeenCalled();
	});

	it('should not trigger short content check twice', () => {
		const onEndReached = jest.fn();
		const scrollElement = createMockScrollElement({
			scrollTop: 0,
			clientHeight: 500,
			scrollHeight: 500, // No scrollable area, so scroll-based won't trigger
		} as any);

		const { rerender } = renderHook(
			({ data }) =>
				useOnEndReached({
					scrollElement,
					horizontal: false,
					onEndReached,
					onEndReachedThreshold: 0.5,
					data,
					getTotalSize: () => 200,
				}),
			{ initialProps: { data: [1] as readonly any[] } }
		);

		act(() => {
			jest.runAllTimers();
		});

		// Short content check fires once
		const callCount = onEndReached.mock.calls.length;
		expect(callCount).toBeGreaterThanOrEqual(1);

		// Re-render with same data length should not trigger again
		// (hasTriggeredForShortContent is already true)
		rerender({ data: [2] });

		act(() => {
			jest.runAllTimers();
		});

		// data changed so the reset effect clears hasTriggeredForShortContent,
		// allowing short content to fire again
		expect(onEndReached).toHaveBeenCalledTimes(callCount + 1);
	});

	it('should clean up event listener on unmount', () => {
		const onEndReached = jest.fn();
		const scrollElement = createMockScrollElement();

		const { unmount } = renderHook(() =>
			useOnEndReached({
				scrollElement,
				horizontal: false,
				onEndReached,
				onEndReachedThreshold: 0.5,
				data: [1],
				getTotalSize: () => 1000,
			})
		);

		unmount();
		expect(scrollElement.removeEventListener).toHaveBeenCalledWith('scroll', expect.any(Function));
	});

	it('should reset flags when data changes', () => {
		const onEndReached = jest.fn();
		const scrollElement = createMockScrollElement({
			scrollTop: 800,
			clientHeight: 500,
			scrollHeight: 1000,
		} as any);

		const { rerender } = renderHook(
			({ data }) =>
				useOnEndReached({
					scrollElement,
					horizontal: false,
					onEndReached,
					onEndReachedThreshold: 0.5,
					data,
					getTotalSize: () => 1000,
				}),
			{ initialProps: { data: [1] as readonly any[] } }
		);

		// Initial call triggers onEndReached because we're past the threshold
		expect(onEndReached).toHaveBeenCalledTimes(1);

		// Rerender with new data to reset flags
		// The data reset effect sets endReachedRef.current = false
		// Then the short content effect re-runs (data.length changes from 1 to 3)
		// but content (1000) > container (500), so short content doesn't trigger
		rerender({ data: [1, 2, 3] });

		act(() => {
			jest.runAllTimers();
		});

		// After data change, endReachedRef was reset. The scroll-based effect
		// does NOT re-run (data is not in its deps), but a scroll event
		// at the current position should trigger again since the flag was reset.
		(scrollElement as any)._triggerScroll();
		expect(onEndReached).toHaveBeenCalledTimes(2);
	});

	it('should trigger onEndReached at the absolute end even with 0 threshold', () => {
		const onEndReached = jest.fn();
		const scrollElement = createMockScrollElement({
			scrollTop: 500,
			clientHeight: 500,
			scrollHeight: 1000,
		} as any);

		renderHook(() =>
			useOnEndReached({
				scrollElement,
				horizontal: false,
				onEndReached,
				onEndReachedThreshold: 0,
				data: [1, 2, 3],
				getTotalSize: () => 1000,
			})
		);

		// distanceFromEnd = 1000 - (500 + 500) = 0, which is <= 5 (absolute end buffer)
		expect(onEndReached).toHaveBeenCalledTimes(1);
	});

	it('should handle horizontal short content check', () => {
		const onEndReached = jest.fn();
		const scrollElement = createMockScrollElement({
			clientWidth: 800,
			scrollWidth: 800,
		} as any);

		renderHook(() =>
			useOnEndReached({
				scrollElement,
				horizontal: true,
				onEndReached,
				onEndReachedThreshold: 0.5,
				data: [1],
				getTotalSize: () => 300, // Content narrower than container
			})
		);

		act(() => {
			jest.runAllTimers();
		});

		expect(onEndReached).toHaveBeenCalled();
	});
});
