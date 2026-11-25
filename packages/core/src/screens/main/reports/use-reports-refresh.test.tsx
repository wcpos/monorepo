/** @jest-environment jsdom */
import type { AppStateStatus } from 'react-native';

import { act, renderHook } from '@testing-library/react';

import {
	REPORTS_REFRESH_MS,
	type ReportsRefreshCadence,
	reportsRefreshCadence,
	useReportsRefresh,
} from './use-reports-refresh';

let mockFocused = true;
const mockListeners = new Set<(state: AppStateStatus) => void>();
const mockAppState = {
	currentState: 'active' as AppStateStatus,
	addEventListener: jest.fn((_event: string, listener: (state: AppStateStatus) => void) => {
		mockListeners.add(listener);
		return { remove: () => mockListeners.delete(listener) };
	}),
};

jest.mock('expo-router', () => ({ useIsFocused: () => mockFocused }));
jest.mock('react-native', () => ({
	get AppState() {
		return mockAppState;
	},
}));

const sync = jest.fn<Promise<void>, []>();
const handle = { sync, value: { laneComplete: false, laneProgress: null as unknown } };

function appState(state: AppStateStatus) {
	act(() => {
		mockAppState.currentState = state;
		mockListeners.forEach((listener) => listener(state));
	});
}

function render(cadence: ReportsRefreshCadence) {
	return renderHook(() => useReportsRefresh(handle, () => cadence));
}

/** The next sync calls stay in flight until the test settles them. */
function pending() {
	const settle = { resolve: () => {}, reject: (_error: Error) => {} };
	sync.mockImplementation(
		() =>
			new Promise<void>((resolve, reject) => {
				Object.assign(settle, { resolve, reject });
			})
	);
	return settle;
}

async function settle() {
	await act(async () => {});
}

describe('reportsRefreshCadence', () => {
	const today = {
		from: new Date('2026-11-25T00:00:00Z'),
		to: new Date('2026-11-25T23:59:59.999Z'),
	};

	it('gives a range inside today the interval', () => {
		expect(reportsRefreshCadence({ from: today.from, to: today.to }, today)).toBe('interval');
	});

	it('gives a range from yesterday to the end of today focus re-reads only', () => {
		const range = { from: new Date('2026-11-24T00:00:00Z'), to: today.to };
		expect(reportsRefreshCadence(range, today)).toBe('focus');
	});

	it('gives a range ending yesterday no re-reads', () => {
		const range = {
			from: new Date('2026-11-24T00:00:00Z'),
			to: new Date('2026-11-24T23:59:59.999Z'),
		};
		expect(reportsRefreshCadence(range, today)).toBe('none');
	});

	it('gives a range that starts tomorrow focus re-reads only', () => {
		const range = {
			from: new Date('2026-11-26T00:00:00Z'),
			to: new Date('2026-11-26T23:59:59.999Z'),
		};
		expect(reportsRefreshCadence(range, today)).toBe('focus');
	});

	it('gives a range ending at the start of today focus, one millisecond earlier none', () => {
		const from = new Date('2026-11-24T00:00:00Z');
		expect(reportsRefreshCadence({ from, to: today.from }, today)).toBe('focus');
		const to = new Date(today.from.getTime() - 1);
		expect(reportsRefreshCadence({ from, to }, today)).toBe('none');
	});
});

describe('useReportsRefresh', () => {
	beforeEach(() => {
		jest.useFakeTimers();
		mockFocused = true;
		mockAppState.currentState = 'active';
		mockListeners.clear();
		mockAppState.addEventListener.mockClear();
		sync.mockReset().mockResolvedValue(undefined);
		handle.value = { laneComplete: false, laneProgress: null };
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it('runs no pass at mount', () => {
		render('interval');
		expect(sync).not.toHaveBeenCalled();
	});

	it('runs one pass when focus returns after a blur', async () => {
		const { rerender } = render('focus');
		mockFocused = false;
		rerender();
		expect(sync).not.toHaveBeenCalled();
		mockFocused = true;
		rerender();
		expect(sync).toHaveBeenCalledTimes(1);
		await settle();
		rerender();
		expect(sync).toHaveBeenCalledTimes(1);
	});

	it('runs one pass when the app returns to active after the background', () => {
		render('focus');
		appState('background');
		expect(sync).not.toHaveBeenCalled();
		appState('active');
		expect(sync).toHaveBeenCalledTimes(1);
	});

	it('with interval, runs a pass every 60 s while active and none while inactive', async () => {
		const { rerender } = render('interval');
		act(() => {
			jest.advanceTimersByTime(REPORTS_REFRESH_MS);
		});
		expect(sync).toHaveBeenCalledTimes(1);
		await settle();
		act(() => {
			jest.advanceTimersByTime(REPORTS_REFRESH_MS);
		});
		expect(sync).toHaveBeenCalledTimes(2);
		await settle();
		mockFocused = false;
		rerender();
		act(() => {
			jest.advanceTimersByTime(REPORTS_REFRESH_MS * 3);
		});
		expect(sync).toHaveBeenCalledTimes(2);
		mockFocused = true;
		rerender();
		expect(sync).toHaveBeenCalledTimes(3);
		await settle();
		appState('background');
		act(() => {
			jest.advanceTimersByTime(REPORTS_REFRESH_MS * 3);
		});
		expect(sync).toHaveBeenCalledTimes(3);
	});

	it('with focus, runs no pass after 60 s but one when focus returns', () => {
		const { rerender } = render('focus');
		act(() => {
			jest.advanceTimersByTime(REPORTS_REFRESH_MS * 2);
		});
		expect(sync).not.toHaveBeenCalled();
		mockFocused = false;
		rerender();
		mockFocused = true;
		rerender();
		expect(sync).toHaveBeenCalledTimes(1);
	});

	it('with none, runs no pass on focus return or timer', () => {
		const { rerender } = render('none');
		mockFocused = false;
		rerender();
		mockFocused = true;
		rerender();
		appState('background');
		appState('active');
		act(() => {
			jest.advanceTimersByTime(REPORTS_REFRESH_MS * 3);
		});
		expect(sync).not.toHaveBeenCalled();
	});

	it('a range changed to today on an active screen starts the timer, and changed away stops it', async () => {
		const { rerender } = renderHook(
			({ cadence }: { cadence: ReportsRefreshCadence }) => useReportsRefresh(handle, () => cadence),
			{ initialProps: { cadence: 'none' as ReportsRefreshCadence } }
		);
		const period = () =>
			act(() => {
				jest.advanceTimersByTime(REPORTS_REFRESH_MS);
			});
		period();
		expect(sync).not.toHaveBeenCalled();
		rerender({ cadence: 'interval' });
		period();
		expect(sync).toHaveBeenCalledTimes(1);
		await settle();
		rerender({ cadence: 'none' });
		period();
		expect(sync).toHaveBeenCalledTimes(1);
	});

	it('keeps at most one pass in flight', async () => {
		let resolve!: () => void;
		sync.mockImplementation(
			() =>
				new Promise<void>((done) => {
					resolve = done;
				})
		);
		render('interval');
		act(() => {
			jest.advanceTimersByTime(REPORTS_REFRESH_MS);
		});
		act(() => {
			jest.advanceTimersByTime(REPORTS_REFRESH_MS);
		});
		expect(sync).toHaveBeenCalledTimes(1);
		await act(async () => {
			resolve();
		});
		act(() => {
			jest.advanceTimersByTime(REPORTS_REFRESH_MS);
		});
		expect(sync).toHaveBeenCalledTimes(2);
	});

	it('swallows a failed pass and keeps refreshing', async () => {
		sync.mockRejectedValueOnce(new Error('offline'));
		render('interval');
		act(() => {
			jest.advanceTimersByTime(REPORTS_REFRESH_MS);
		});
		await settle();
		act(() => {
			jest.advanceTimersByTime(REPORTS_REFRESH_MS);
		});
		expect(sync).toHaveBeenCalledTimes(2);
	});

	// The store's midnight re-renders nothing on Pro: the timer pass asks for the cadence itself.
	it('reads the cadence when a timer pass runs, with no re-render', async () => {
		let cadence: ReportsRefreshCadence = 'interval';
		let renders = 0;
		renderHook(() => {
			renders += 1;
			return useReportsRefresh(handle, () => cadence);
		});
		const rendered = renders;
		act(() => {
			jest.advanceTimersByTime(REPORTS_REFRESH_MS);
		});
		expect(sync).toHaveBeenCalledTimes(1);
		await settle();
		cadence = 'none';
		act(() => {
			jest.advanceTimersByTime(REPORTS_REFRESH_MS * 3);
		});
		expect(sync).toHaveBeenCalledTimes(1);
		expect(renders).toBe(rendered);
	});

	describe('quiet', () => {
		beforeEach(() => {
			handle.value = { laneComplete: true, laneProgress: null };
		});

		const tick = () =>
			act(() => {
				jest.advanceTimersByTime(REPORTS_REFRESH_MS);
			});

		it('is true during a timer pass on a whole, idle lane and false once it resolves', async () => {
			const pass = pending();
			const { result } = render('interval');
			expect(result.current).toBe(false);
			tick();
			expect(sync).toHaveBeenCalledTimes(1);
			expect(result.current).toBe(true);
			await act(async () => pass.resolve());
			expect(result.current).toBe(false);
		});

		it('is false once the pass rejects', async () => {
			const pass = pending();
			const { result } = render('interval');
			tick();
			expect(result.current).toBe(true);
			await act(async () => pass.reject(new Error('offline')));
			expect(result.current).toBe(false);
		});

		it('is false for a return pass', () => {
			pending();
			const { result, rerender } = render('interval');
			mockFocused = false;
			rerender();
			mockFocused = true;
			rerender();
			expect(sync).toHaveBeenCalledTimes(1);
			expect(result.current).toBe(false);
		});

		it('is false when the lane is not whole at the start', () => {
			handle.value = { laneComplete: false, laneProgress: null };
			pending();
			const { result } = render('interval');
			tick();
			expect(sync).toHaveBeenCalledTimes(1);
			expect(result.current).toBe(false);
		});

		it('is false when the lane is downloading at the start', () => {
			handle.value = { laneComplete: true, laneProgress: { downloaded: 1, total: 2 } };
			pending();
			const { result } = render('interval');
			tick();
			expect(sync).toHaveBeenCalledTimes(1);
			expect(result.current).toBe(false);
		});

		it('is false for a new handle given mid-pass', () => {
			pending();
			const next = { ...handle, sync: jest.fn<Promise<void>, []>() };
			const { result, rerender } = renderHook(
				({ target }) => useReportsRefresh(target, () => 'interval'),
				{ initialProps: { target: handle } }
			);
			tick();
			expect(result.current).toBe(true);
			rerender({ target: next });
			expect(result.current).toBe(false);
		});
	});

	it('leaves no timer or listener after unmount', () => {
		const { unmount } = render('interval');
		unmount();
		expect(jest.getTimerCount()).toBe(0);
		expect(mockListeners.size).toBe(0);
		act(() => {
			jest.advanceTimersByTime(REPORTS_REFRESH_MS * 3);
		});
		expect(sync).not.toHaveBeenCalled();
	});
});
