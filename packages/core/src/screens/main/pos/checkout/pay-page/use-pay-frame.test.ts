/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';

import type { CategoryLogger } from '@wcpos/utils/logger';

import { PAYMENT_FRAME_LOAD_TIMEOUT_MS, usePayFrame } from './use-pay-frame';

type Input = Parameters<typeof usePayFrame>[0];
type Handlers = { onLoad(): void; onLoadStart(): void; onError(event: object): void };
const PAY_URL = 'https://shop.example.com/wcpos-checkout/order-pay/42?token=jwt-token';

// The frame's key is its identity: a new key is a remount (a fresh navigation), which
// the component suite counted as a WebView mount.
const renderFrame = (overrides: Partial<Input> = {}) => {
	const report = jest.fn();
	const onLaterDocument = jest.fn();
	const logger = { debug: jest.fn(), warn: jest.fn() } as unknown as CategoryLogger;
	const keys: string[] = [];
	const initialProps: Input = {
		src: PAY_URL,
		retryToken: 0,
		prepared: null,
		report,
		onLaterDocument,
		logger,
		...overrides,
	};
	const hook = renderHook(
		(props: Input) => {
			const frame = usePayFrame(props);
			if (keys[keys.length - 1] !== frame.key) keys.push(frame.key);
			return frame;
		},
		{ initialProps }
	);
	// Test events are partial literals; the engine types the real one.
	const handlers = () => hook.result.current.handlers as unknown as Handlers;
	const rerender = (next: Partial<Input>) => hook.rerender({ ...initialProps, ...next });
	return {
		...hook,
		report,
		onLaterDocument,
		logger,
		handlers,
		rerender,
		mounts: () => keys.length,
	};
};

describe('usePayFrame load watchdog', () => {
	beforeEach(() => {
		jest.useFakeTimers();
	});
	afterEach(() => {
		jest.useRealTimers();
	});

	it('reloads the frame once when no load event arrives, then reports the stall', () => {
		// iOS simulators on the CI runners (runs 33750030091 tablet, 33758920470
		// phone): the pay page reached the store five minutes late, or never,
		// and the footer spun for the whole 180 s flow budget.
		const { report, mounts } = renderFrame();
		expect(mounts()).toBe(1);

		act(() => {
			jest.advanceTimersByTime(PAYMENT_FRAME_LOAD_TIMEOUT_MS);
		});
		expect(mounts()).toBe(2);
		expect(report).not.toHaveBeenCalledWith('failed');
		expect(report).toHaveBeenLastCalledWith('loading');

		act(() => {
			jest.advanceTimersByTime(PAYMENT_FRAME_LOAD_TIMEOUT_MS);
		});
		expect(mounts()).toBe(2);
		expect(report).toHaveBeenLastCalledWith('stalled');
	});

	it('does not watch a frame that has no payment link — there is no navigation to time', () => {
		const { report, mounts } = renderFrame({ src: '' });

		act(() => {
			jest.advanceTimersByTime(PAYMENT_FRAME_LOAD_TIMEOUT_MS * 3);
		});
		expect(mounts()).toBe(1);
		expect(report).not.toHaveBeenCalledWith('stalled');
		expect(report).not.toHaveBeenCalledWith('failed');
	});

	it('an error on the first document is a stall (retryable); on a later navigation it is a failure', () => {
		const { report, handlers } = renderFrame();

		act(() => {
			handlers().onError({ nativeEvent: { code: -1001, description: 'timed out' } });
		});
		expect(report).toHaveBeenLastCalledWith('stalled');

		// The document loads on the reload; the gateway's redirect then errors.
		act(() => {
			handlers().onLoad();
		});
		act(() => {
			handlers().onLoadStart();
			handlers().onError({ nativeEvent: { code: -1009, description: 'offline' } });
		});
		expect(report).toHaveBeenLastCalledWith('failed');
	});

	// The native engine marks an Android error that follows its synthetic finish
	// `retractsLoad`, and swallows the error page's load-start (the raw sequence is
	// pinned in packages/components/src/webview/index.test.tsx). Run 38478468639
	// (Android phone, flow 04): net::ERR_SOCKET_NOT_CONNECTED on the pay page left
	// Process Payment spinning with no Retry for 8 minutes.
	describe('Android: a load the engine retracts', () => {
		const failedNavigation = (handlers: () => Handlers) => {
			act(() => {
				handlers().onLoad();
			});
			act(() => {
				handlers().onError({
					nativeEvent: {
						code: -6,
						description: 'net::ERR_SOCKET_NOT_CONNECTED',
						retractsLoad: true,
					},
				});
			});
		};

		it('on the first document is a stall the cashier can retry, not a spinner', () => {
			const { report, handlers, rerender } = renderFrame();

			failedNavigation(handlers);

			expect(report).toHaveBeenLastCalledWith('stalled');

			// The cashier's Retry is a fresh navigation that loads.
			rerender({ retryToken: 1 });
			expect(report).toHaveBeenLastCalledWith('loading');
			act(() => {
				handlers().onLoad();
			});
			expect(report).toHaveBeenLastCalledWith('ready');
		});

		it('on a later navigation is a failure, not a spinner, and offers no reload', () => {
			const { report, handlers, mounts } = renderFrame();
			act(() => {
				handlers().onLoad();
			});
			expect(report).toHaveBeenLastCalledWith('ready');

			// Android sends no load-start before a navigation fails (it comes from
			// the history update): the synthetic finish and the error arrive first.
			failedNavigation(handlers);

			expect(report).toHaveBeenLastCalledWith('failed');
			act(() => {
				jest.advanceTimersByTime(PAYMENT_FRAME_LOAD_TIMEOUT_MS * 3);
			});
			expect(mounts()).toBe(1);
			expect(report).toHaveBeenLastCalledWith('failed');
		});

		// Android sends no load-start before a failed navigation, so nothing between the two
		// loads clears the earlier count: the ignored load must.
		it('a retraction of a load ignored while held does not undo the load before it', () => {
			const { report, handlers, result } = renderFrame();
			act(() => {
				handlers().onLoad();
			});
			act(() => {
				result.current.hold();
			});
			failedNavigation(handlers);
			expect(report).toHaveBeenLastCalledWith('failed');
		});

		it('a retraction of a load ignored while expired stays failed, never a Retry', () => {
			const { report, handlers, result } = renderFrame();
			act(() => {
				handlers().onLoad();
			});
			act(() => {
				result.current.expire();
			});
			failedNavigation(handlers);
			expect(report).toHaveBeenLastCalledWith('failed');
		});
	});

	describe('while held (a session refresh in flight)', () => {
		it('a load is ignored: the gate stays closed', () => {
			const { report, handlers, result } = renderFrame();
			act(() => {
				result.current.hold();
			});
			act(() => {
				handlers().onLoad();
			});
			expect(report).not.toHaveBeenCalledWith('ready');
			expect(report).toHaveBeenLastCalledWith('loading');
		});

		it('the watchdog stays quiet: no reload, no stall', () => {
			const { report, result, mounts } = renderFrame();
			act(() => {
				result.current.hold();
			});
			act(() => {
				jest.advanceTimersByTime(PAYMENT_FRAME_LOAD_TIMEOUT_MS * 3);
			});
			expect(mounts()).toBe(1);
			expect(report).not.toHaveBeenCalledWith('stalled');
		});
	});

	// iOS (WKWebView) and web (<iframe>) never fire `onLoad` for a failed document,
	// so the engine never marks their errors: their sequences are exactly as they were.
	describe('iOS and web sequences are unchanged', () => {
		it('iOS: a first-document error is a stall; a loaded document then gates ready', () => {
			const { report, handlers } = renderFrame();
			act(() => {
				handlers().onLoadStart();
				handlers().onError({ nativeEvent: { code: -1009, description: 'offline' } });
			});
			expect(report.mock.calls.map(([status]) => status)).toEqual([
				'loading',
				'loading',
				'stalled',
			]);
		});

		it('iOS: a new navigation after a failed redirect re-gates the frame', () => {
			const { report, handlers } = renderFrame();
			act(() => {
				handlers().onLoad();
			});
			act(() => {
				handlers().onLoadStart();
				handlers().onError({ nativeEvent: { code: -1009, description: 'x', retractsLoad: false } });
			});
			expect(report).toHaveBeenLastCalledWith('failed');
			act(() => {
				handlers().onLoadStart();
			});
			expect(report).toHaveBeenLastCalledWith('loading');
			act(() => {
				handlers().onLoad();
			});
			expect(report).toHaveBeenLastCalledWith('ready');
		});

		it('iOS: a form post back to the loaded URL that errors stays a failure, never a Retry', () => {
			// The pay page loaded, the cashier pressed, the order-pay form POSTed back
			// to its own URL and that navigation failed: a sale may be paid, so the
			// load-start in between must keep the earlier load counted.
			const { report, handlers, mounts } = renderFrame();
			act(() => {
				handlers().onLoad();
			});
			act(() => {
				handlers().onLoadStart();
				handlers().onError({
					nativeEvent: { code: -1005, description: 'lost', retractsLoad: false },
				});
			});
			expect(report).toHaveBeenLastCalledWith('failed');
			act(() => {
				jest.advanceTimersByTime(PAYMENT_FRAME_LOAD_TIMEOUT_MS * 3);
			});
			expect(mounts()).toBe(1);
			expect(report).toHaveBeenLastCalledWith('failed');
		});

		it('a load after an error clears it: a later navigation to that URL re-gates the frame', () => {
			const { report, handlers } = renderFrame();
			act(() => {
				handlers().onError({ nativeEvent: { code: -1009, description: 'offline' } });
			});
			act(() => {
				handlers().onLoad();
			});
			expect(report).toHaveBeenLastCalledWith('ready');
			act(() => {
				handlers().onLoadStart();
			});
			expect(report).toHaveBeenLastCalledWith('loading');
		});

		it('web: an iframe error after a load stays a failure (the iframe names no URL)', () => {
			const { report, handlers } = renderFrame();
			act(() => {
				handlers().onLoad();
			});
			act(() => {
				handlers().onError({});
			});
			expect(report).toHaveBeenLastCalledWith('failed');
		});

		it('iOS: an error naming another URL than the loaded document stays a failure', () => {
			const { report, handlers } = renderFrame();
			act(() => {
				handlers().onLoad();
			});
			act(() => {
				handlers().onError({ nativeEvent: { code: -1009, description: 'x', retractsLoad: false } });
			});
			expect(report).toHaveBeenLastCalledWith('failed');
		});

		it('web: an iframe load with no navigation events still gates ready', () => {
			const { report, handlers } = renderFrame();
			act(() => {
				handlers().onLoad();
			});
			expect(report.mock.calls.map(([status]) => status)).toEqual(['loading', 'ready']);
		});
	});

	it('a load event before the deadline disarms the watchdog', () => {
		const { report, handlers, mounts } = renderFrame();

		act(() => {
			handlers().onLoad();
		});
		expect(report).toHaveBeenLastCalledWith('ready');

		act(() => {
			jest.advanceTimersByTime(PAYMENT_FRAME_LOAD_TIMEOUT_MS * 3);
		});
		expect(mounts()).toBe(1);
		expect(report).not.toHaveBeenCalledWith('stalled');
	});

	it("the cashier's Retry remounts the frame, re-gates it, and reports a second stall", () => {
		const { report, rerender, mounts } = renderFrame();
		// One deadline per act: the reload's re-arm is a render, and React flushes
		// it when the act ends, not between two timers advanced in one go.
		act(() => {
			jest.advanceTimersByTime(PAYMENT_FRAME_LOAD_TIMEOUT_MS);
		});
		act(() => {
			jest.advanceTimersByTime(PAYMENT_FRAME_LOAD_TIMEOUT_MS);
		});
		expect(report).toHaveBeenLastCalledWith('stalled');
		expect(mounts()).toBe(2);

		rerender({ retryToken: 1 });
		expect(mounts()).toBe(3);
		expect(report).toHaveBeenLastCalledWith('loading');

		// The retry is the attempt: a stall now is reported, not reloaded again quietly.
		act(() => {
			jest.advanceTimersByTime(PAYMENT_FRAME_LOAD_TIMEOUT_MS);
		});
		expect(mounts()).toBe(3);
		expect(report).toHaveBeenLastCalledWith('stalled');
	});
});

describe('usePayFrame frame-status signal', () => {
	it('reports the frame as loading on mount, then ready on the load event', () => {
		const { report, handlers } = renderFrame();

		expect(report).toHaveBeenCalledWith('loading');
		expect(report).not.toHaveBeenCalledWith('ready');

		act(() => {
			handlers().onLoad();
		});

		expect(report).toHaveBeenLastCalledWith('ready');
	});

	it('re-gates when the frame starts navigating away from the order-pay page', () => {
		const { report, handlers } = renderFrame();

		act(() => {
			handlers().onLoad();
		});
		expect(report).toHaveBeenLastCalledWith('ready');

		// A gateway redirect swaps the document under the frame; the new one has no
		// `wcpos-process-payment` listener until it, too, has loaded.
		act(() => {
			handlers().onLoadStart();
		});

		expect(report).toHaveBeenLastCalledWith('loading');
	});

	it('re-gates when the payment URL changes', () => {
		const { report, handlers, rerender } = renderFrame();

		act(() => {
			handlers().onLoad();
		});
		expect(report).toHaveBeenLastCalledWith('ready');

		rerender({ src: 'https://shop.example.com/wcpos-checkout/order-pay/43?token=jwt-token' });

		expect(report).toHaveBeenLastCalledWith('loading');
	});

	it('re-gates on unmount so a remounted frame never starts enabled', () => {
		const { report, handlers, unmount } = renderFrame();

		act(() => {
			handlers().onLoad();
		});
		expect(report).toHaveBeenLastCalledWith('ready');

		unmount();

		expect(report).toHaveBeenLastCalledWith('loading');
	});

	it('reports a failed load instead of waiting for a load event that will never arrive', () => {
		const { report, handlers, logger } = renderFrame();

		act(() => {
			handlers().onLoadStart();
			handlers().onError({ nativeEvent: { description: 'net::ERR_NAME_NOT_RESOLVED' } });
		});

		// Without this the gate would close on load start and never reopen, leaving
		// the cashier with a button that spins forever — the exact failure the gate
		// exists to prevent, moved one step earlier.
		// On the FIRST document the error is a stall: nothing was posted, so the
		// checkout may offer a retry that navigates to the pay page again.
		expect(report).toHaveBeenLastCalledWith('stalled');
		expect(logger.warn).toHaveBeenCalledWith('Payment form failed to load in the checkout frame', {
			context: { description: 'net::ERR_NAME_NOT_RESOLVED', code: undefined },
		});
	});

	it('reports only later documents, for the fallback poll', () => {
		const { handlers, onLaterDocument } = renderFrame();
		act(() => {
			handlers().onLoad();
		});
		expect(onLaterDocument).not.toHaveBeenCalled();
		act(() => {
			handlers().onLoadStart();
			handlers().onLoad();
		});
		expect(onLaterDocument).toHaveBeenCalledTimes(1);
	});
});
