/**
 * @jest-environment jsdom
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

import { useDateFormat } from './use-date-format';

const mockVisibleRef = { current: false };
let mockSubscriptionCount = 0;
const mockVisibleSource$ = new BehaviorSubject(false);
const mockVisible$ = new Observable<boolean>((subscriber) => {
	mockSubscriptionCount += 1;
	return mockVisibleSource$.subscribe(subscriber);
});
const mockHeartbeat$ = new Subject<number>();
const mockFormatDate = jest.fn((_date: Date, _pattern?: string) => 'formatted date');

jest.mock('expo-router', () => ({
	useFocusEffect: jest.fn(),
}));

jest.mock('observable-hooks', () => ({
	...jest.requireActual('observable-hooks'),
	useObservableRef: () => [mockVisibleRef, mockVisible$],
}));

jest.mock('@wcpos/hooks/use-heartbeat', () => ({
	useHeartbeatObservable: () => mockHeartbeat$,
}));

jest.mock('../../../hooks/use-local-date', () => ({
	convertUTCStringToLocalDate: (value: string) => new Date(`${value}Z`),
	useLocalDate: () => ({
		dateFnsLocale: undefined,
		formatDate: mockFormatDate,
	}),
}));

describe('useDateFormat', () => {
	beforeEach(() => {
		mockSubscriptionCount = 0;
		mockVisibleSource$.next(false);
		mockFormatDate.mockReset();
		mockFormatDate.mockReturnValue('formatted date');
	});

	/**
	 * Regression for the stale-seed class (#1542, #1551).
	 *
	 * Neither `visible$` (parked at `false`) nor the heartbeat emits during this test, so
	 * the rendered value comes entirely from the non-observable path — which is exactly
	 * the situation of a date that is not today. The hook used to pass `getDisplayDate()` as
	 * `useObservableState`'s INITIAL state, latching the mount-time string, so a
	 * recycled row handed a new `gmtDate` went on rendering the old date forever.
	 */
	it('re-derives the display value when the date input changes', () => {
		mockFormatDate.mockImplementation((date: Date) => date.toISOString());

		const { result, rerender } = renderHook(({ gmtDate }) => useDateFormat(gmtDate), {
			initialProps: { gmtDate: '2024-01-01T00:00:00' },
		});

		expect(result.current).toBe('2024-01-01T00:00:00.000Z');

		rerender({ gmtDate: '2024-06-15T00:00:00' });

		expect(result.current).toBe('2024-06-15T00:00:00.000Z');
	});

	/**
	 * Regression for the dropped FIRST heartbeat.
	 *
	 * `useHeartbeatObservable` is an rxjs `interval()`, so its first emission is `0`. While
	 * the refresh was wired as `useObservableState(refresh$, 0)`, that first tick called
	 * `setState(0)` with the state already `0` and React bailed out of the render — the
	 * relative date stayed stale for a further minute. The subscription now feeds a reducer
	 * that ignores the emitted value, so the tick re-renders whatever it carried.
	 */
	it('re-renders on the first heartbeat tick, whose value is 0', () => {
		mockFormatDate.mockReturnValue('first');

		const { result } = renderHook(() => useDateFormat(Date.now(), 'MMMM d, yyyy', false));

		expect(result.current).toBe('first');

		mockFormatDate.mockReturnValue('second');
		act(() => {
			mockVisibleSource$.next(true);
			mockHeartbeat$.next(0);
		});

		expect(result.current).toBe('second');
	});

	it.each([
		['number', Date.UTC(2024, 0, 1), Date.UTC(2024, 0, 2)],
		['string', '2024-01-01T00:00:00', '2024-01-02T00:00:00'],
	])(
		'keeps its observable subscription until the %s date input changes',
		async (_, firstDate, secondDate) => {
			const { rerender } = renderHook(({ gmtDate }) => useDateFormat(gmtDate), {
				initialProps: { gmtDate: firstDate },
			});

			await waitFor(() => expect(mockSubscriptionCount).toBe(1));

			rerender({ gmtDate: firstDate });
			expect(mockSubscriptionCount).toBe(1);

			rerender({ gmtDate: secondDate });
			await waitFor(() => expect(mockSubscriptionCount).toBe(2));
		}
	);
});
