/**
 * @jest-environment jsdom
 */
import { renderHook, waitFor } from '@testing-library/react';
import { NEVER, Observable } from 'rxjs';

import { useDateFormat } from './use-date-format';

const mockVisibleRef = { current: false };
let mockSubscriptionCount = 0;
const mockVisible$ = new Observable<boolean>(() => {
	mockSubscriptionCount += 1;
});
const mockFormatDate = jest.fn((_date: Date, _pattern?: string) => 'formatted date');

jest.mock('expo-router', () => ({
	useFocusEffect: jest.fn(),
}));

jest.mock('observable-hooks', () => ({
	...jest.requireActual('observable-hooks'),
	useObservableRef: () => [mockVisibleRef, mockVisible$],
}));

jest.mock('@wcpos/hooks/use-heartbeat', () => ({
	useHeartbeatObservable: () => NEVER,
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
		mockFormatDate.mockReset();
		mockFormatDate.mockReturnValue('formatted date');
	});

	/**
	 * Regression for the stale-seed class (#1542, #1551).
	 *
	 * `visible$` and the heartbeat are both mocked to never emit, so the rendered value
	 * comes entirely from the non-observable path — which is exactly the situation of a
	 * date that is not today. The hook used to pass `getDisplayDate()` as
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
